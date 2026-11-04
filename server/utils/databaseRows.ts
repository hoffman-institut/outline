import { Node } from "prosemirror-model";
import type { Transaction } from "prosemirror-state";
import { EditorState } from "prosemirror-state";
import { v4 as uuidv4 } from "uuid";
import { updateYFragment, yDocToProsemirrorJSON } from "y-prosemirror";
import * as Y from "yjs";
import type {
  CellValue,
  Column,
  DatabaseData,
  DatabaseRef,
} from "@shared/editor/lib/database";
import {
  ColumnType,
  ViewType,
  displayValue,
  nextAutoNumber,
  normalizeDatabase,
  parseDateValue,
} from "@shared/editor/lib/database";
import {
  calculatedTypes,
  computeDatabase,
} from "@shared/editor/lib/databaseCompute";
import type { ProsemirrorData } from "@shared/types";
import { schema } from "@server/editor";
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from "@server/errors";
import Logger from "@server/logging/Logger";
import { Document } from "@server/models";
import type { User } from "@server/models";
import { DocumentHelper } from "@server/models/helpers/DocumentHelper";
import { authorize, can } from "@server/policies";
import { sequelize } from "@server/storage/database";
import { requestContext } from "@server/storage/requestContext";
import type { APIContext } from "@server/types";

/**
 * Rows of database blocks changed outside the editor (the REST API, forms,
 * rows created from a relation in another document, MCP tools). Changes are
 * applied to the collaborative state like an edit in the editor, so open
 * editors merge them and edits of other people are kept.
 */

type Located = { node: Node; pos: number; data: DatabaseData };
type Context = APIContext["context"];
type Cells = Record<string, CellValue>;
/** A change in the collaborative state: its client and the clock after it. */
type Version = { client: number; clock: number };

/** Longest text a cell may hold when set through the API. */
const maxText = 10000;

/** A database block of a document with its data. */
export type FoundDatabase = DatabaseData & { id: string };

/**
 * Applies a change to a database block of a document state.
 *
 * @param state collaborative state of the document.
 * @param databaseId the database block.
 * @param edit builds the change.
 * @returns the new state and content, with the version of the change.
 */
function editDatabase(
  state: Uint8Array,
  databaseId: string,
  edit: (db: Located, tr: Transaction) => void
): {
  state: Buffer;
  content: ProsemirrorData;
  version: Version;
  changed: boolean;
} {
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, state);
  const doc = Node.fromJSON(schema, yDocToProsemirrorJSON(ydoc, "default"));
  let found: Located | undefined;
  doc.descendants((node, pos) => {
    if (found) {
      return false;
    }
    if (node.type.name === "database" && node.attrs.id === databaseId) {
      found = {
        node,
        pos,
        data: normalizeDatabase({
          title: node.attrs.title,
          columns: node.attrs.columns,
          views: node.attrs.views,
        }),
      };
      return false;
    }
    return true;
  });
  if (!found) {
    throw NotFoundError("Database not found in the document");
  }
  const tr = EditorState.create({ doc, schema }).tr;
  edit(found, tr);

  // Mutate the existing state, so the change continues its history instead
  // of duplicating the content for clients that hold the original state.
  const fragment = ydoc.get("default", Y.XmlFragment) as Y.XmlFragment;
  updateYFragment(ydoc, fragment, tr.doc, {
    mapping: new Map(),
    isOMark: new Map(),
  });
  return {
    state: Buffer.from(Y.encodeStateAsUpdate(ydoc)),
    content: Node.fromJSON(
      schema,
      yDocToProsemirrorJSON(ydoc, "default")
    ).toJSON() as ProsemirrorData,
    version: {
      client: ydoc.clientID,
      clock: Y.getState(ydoc.store, ydoc.clientID),
    },
    changed: tr.docChanged,
  };
}

/**
 * Finds the column for a key: its id or, for people and AI agents, its name.
 *
 * @param columns the columns of the database.
 * @param key a column id or name.
 * @returns the column, if any.
 */
export function columnFor(columns: Column[], key: string): Column | undefined {
  const name = key.trim().toLowerCase();
  return (
    columns.find((c) => c.id === key) ??
    columns.find((c) => c.name.trim().toLowerCase() === name)
  );
}

/**
 * Checks and converts values to the types of the columns. Calculated and
 * auto number columns are ignored. Keys may be column ids or names; select
 * options may be given by name.
 *
 * @param columns the columns of the database.
 * @param input values by column id or name.
 * @param allowed column ids that may be set, all when undefined.
 * @returns stored cell values.
 */
export function sanitizeCells(
  columns: Column[],
  input: Record<string, unknown>,
  allowed?: Set<string>
): Cells {
  const cells: Cells = {};
  const optionId = (column: Column, value: unknown) =>
    column.options?.find((o) => o.id === value || o.name === value)?.id;
  const list = (value: unknown) =>
    (Array.isArray(value) ? value : value === null ? [] : [value]).filter(
      (v): v is string => typeof v === "string"
    );

  for (const [key, value] of Object.entries(input)) {
    const column = columnFor(columns, key);
    if (
      !column ||
      (allowed && !allowed.has(column.id)) ||
      calculatedTypes.includes(column.type) ||
      column.type === ColumnType.AutoNumber
    ) {
      continue;
    }
    const columnId = column.id;
    if (value === null || value === undefined || value === "") {
      cells[columnId] = column.type === ColumnType.Checkbox ? false : null;
      continue;
    }
    switch (column.type) {
      case ColumnType.Number: {
        const n =
          typeof value === "number"
            ? value
            : parseFloat(String(value).replace(/\s/g, "").replace(",", "."));
        if (!Number.isFinite(n)) {
          throw ValidationError(`${column.name}: not a number`);
        }
        cells[columnId] = n;
        break;
      }
      case ColumnType.Checkbox:
        cells[columnId] = value === true || value === "true" || value === 1;
        break;
      case ColumnType.Date:
        if (!parseDateValue(String(value))) {
          throw ValidationError(`${column.name}: date must be YYYY-MM-DD`);
        }
        cells[columnId] = String(value);
        break;
      case ColumnType.Select:
        cells[columnId] = optionId(column, value) ?? null;
        break;
      case ColumnType.MultiSelect:
        cells[columnId] = list(value)
          .map((v) => optionId(column, v))
          .filter((id): id is string => !!id);
        break;
      case ColumnType.Person:
      case ColumnType.Relation:
      case ColumnType.Files:
        cells[columnId] = list(value);
        break;
      default: {
        const text = String(value);
        if (text.length > maxText) {
          throw ValidationError(`${column.name}: text is too long`);
        }
        cells[columnId] = text;
      }
    }
  }
  return cells;
}

/** Loads a document for a change of its state, locked for the transaction. */
async function loadForChange(
  user: User,
  documentId: string,
  transaction: NonNullable<Context["transaction"]>
) {
  // Lock the row first so a concurrent change cannot overwrite this one.
  await Document.unscoped().findOne({
    where: { id: documentId },
    attributes: ["id"],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const document = await Document.findByPk(documentId, {
    userId: user.id,
    transaction,
    includeState: true,
    includeContent: true,
    rejectOnEmpty: true,
  });
  authorize(user, "read", document);
  return document;
}

/** Applies a change to a database and saves the document. */
function change(
  user: User,
  context: Context,
  ref: DatabaseRef,
  needsUpdate: boolean,
  edit: (db: Located, tr: Transaction, canEdit: boolean) => void
): Promise<Version> {
  return sequelize.transaction(async (transaction) => {
    const document = await loadForChange(user, ref.documentId, transaction);
    const canEdit = !!can(user, "update", document);
    if (needsUpdate) {
      authorize(user, "update", document);
    } else if (!canEdit && !document.isActive) {
      // Forms of archived documents take no more answers.
      throw AuthorizationError("The document is archived");
    }
    const updated = editDatabase(
      DocumentHelper.toState(document),
      ref.databaseId,
      (db, tr) => edit(db, tr, canEdit)
    );
    if (!updated.changed) {
      return updated.version;
    }
    // Hooks notify the collaboration server, which merges the change into
    // the open editors.
    await document.update(
      { state: updated.state, content: updated.content },
      { ...context, transaction }
    );
    return updated.version;
  });
}

/**
 * Whether the stored state of a document holds a change, even when rows it
 * added were deleted since.
 */
async function isStored(ref: DatabaseRef, version: Version) {
  const document = await Document.unscoped().findOne({
    where: { id: ref.documentId },
    attributes: ["id", "state"],
  });
  if (!document?.state) {
    return true;
  }
  const stored = Y.decodeStateVector(
    Y.encodeStateVectorFromUpdate(document.state)
  );
  return (stored.get(version.client) ?? 0) >= version.clock;
}

/**
 * Adds a row. People who can edit the document may set any column; readers
 * may add rows only through a form view, with the fields of the form.
 *
 * @returns the id of the new row.
 */
export async function addDatabaseRow(
  user: User,
  context: Context,
  ref: DatabaseRef,
  input: Record<string, unknown> = {},
  rowId: string = uuidv4()
): Promise<string> {
  const add = (again: boolean) =>
    change(user, context, ref, false, ({ node, pos, data }, tr, canEdit) => {
      const form = data.views.find((v) => v.type === ViewType.Form);
      if (!canEdit && !form) {
        throw AuthorizationError("The database has no form");
      }
      let exists = false;
      node.forEach((child) => {
        if (child.attrs.id === rowId) {
          exists = true;
        }
      });
      if (exists) {
        if (again) {
          return;
        }
        throw ValidationError("A row with this id already exists");
      }
      // Uploads need the right to edit the document, as in the form.
      const allowed =
        canEdit || !form
          ? undefined
          : new Set(
              data.columns
                .filter(
                  (c) =>
                    !form.hidden.includes(c.id) && c.type !== ColumnType.Files
                )
                .map((c) => c.id)
            );
      const values = sanitizeCells(data.columns, input, allowed);
      const rows: { cells: Cells }[] = [];
      node.forEach((child) => rows.push({ cells: child.attrs.cells ?? {} }));
      for (const column of data.columns) {
        if (column.type === ColumnType.AutoNumber) {
          values[column.id] = nextAutoNumber(rows, column.id);
        }
      }
      tr.insert(
        pos + node.nodeSize - 1,
        schema.nodes.database_row.create({ id: rowId, cells: values })
      );
    });
  const version = await add(false);

  // An open editor may save its own older state between our save and the
  // merge of our change, dropping it. Its next save (a few seconds after the
  // merge) brings the change back, so check later and add the row again only
  // if the stored state never got the change. A row that came and was then
  // deleted by someone is not added again. The check runs outside the
  // request, which is over by then: queries of a closed request are refused.
  requestContext.exit(() =>
    setTimeout(() => {
      void (async () => {
        try {
          if (!(await isStored(ref, version))) {
            Logger.warn("Database row lost after save, adding again", {
              documentId: ref.documentId,
              rowId,
            });
            await add(true);
          }
        } catch (err) {
          Logger.error("Database row check failed", err as Error);
        }
      })();
    }, 15000)
  );
  return rowId;
}

/** Changes values of a row. */
export async function updateDatabaseRow(
  user: User,
  context: Context,
  ref: DatabaseRef,
  rowId: string,
  input: Record<string, unknown>
) {
  await change(user, context, ref, true, ({ node, pos, data }, tr) => {
    let rowPos: number | undefined;
    let row: Node | undefined;
    node.forEach((child, offset) => {
      if (child.attrs.id === rowId) {
        row = child;
        rowPos = pos + 1 + offset;
      }
    });
    if (!row || rowPos === undefined) {
      throw NotFoundError("Row not found");
    }
    tr.setNodeMarkup(rowPos, undefined, {
      ...row.attrs,
      cells: { ...row.attrs.cells, ...sanitizeCells(data.columns, input) },
    });
  });
}

/** Deletes a row, with any duplicate of it. */
export async function deleteDatabaseRow(
  user: User,
  context: Context,
  ref: DatabaseRef,
  rowId: string
) {
  await change(user, context, ref, true, ({ node, pos }, tr) => {
    const found: { from: number; to: number }[] = [];
    node.forEach((child, offset) => {
      if (child.attrs.id === rowId) {
        const from = pos + 1 + offset;
        found.push({ from, to: from + child.nodeSize });
      }
    });
    if (!found.length) {
      throw NotFoundError("Row not found");
    }
    found.reverse().forEach(({ from, to }) => tr.delete(from, to));
  });
}

/**
 * Database blocks in the content of a document.
 *
 * @param content ProseMirror JSON of the document.
 * @returns the databases.
 */
export function databasesInContent(
  content: ProsemirrorData | null | undefined
): FoundDatabase[] {
  const result: FoundDatabase[] = [];
  const visit = (node: ProsemirrorData | undefined) => {
    if (!node) {
      return;
    }
    if (node.type === "database" && typeof node.attrs?.id === "string") {
      const seen = new Set<string>();
      result.push({
        id: node.attrs.id as string,
        ...normalizeDatabase({
          title: node.attrs.title,
          columns: node.attrs.columns,
          views: node.attrs.views,
          templates: node.attrs.templates,
          rows: (node.content ?? [])
            .filter((row) => {
              const id = row.attrs?.id as string;
              return !seen.has(id) && !!seen.add(id);
            })
            .map((row) => ({
              id: row.attrs?.id,
              cells: row.attrs?.cells,
              docId: row.attrs?.docId,
            })),
        }),
      });
      return;
    }
    node.content?.forEach(visit);
  };
  visit(content ?? undefined);
  return result;
}

/**
 * Databases of a document the user can read, with calculated columns and
 * the titles of linked rows of databases the user can read.
 *
 * @param user the reader.
 * @param documentId the document.
 * @returns the databases.
 */
export async function readDatabases(user: User, documentId: string) {
  const load = async (id: string) => {
    const document = await Document.findByPk(id, {
      userId: user.id,
      includeContent: true,
    });
    authorize(user, "read", document);
    return databasesInContent(document?.content);
  };
  const databases = await load(documentId);
  const others = new Map<string, FoundDatabase[]>();
  for (const db of databases) {
    for (const column of db.columns) {
      const ref = column.relation;
      if (ref && ref.documentId !== documentId && !others.has(ref.documentId)) {
        others.set(ref.documentId, await load(ref.documentId).catch(() => []));
      }
    }
  }
  const related = (ref: DatabaseRef) =>
    (ref.documentId === documentId
      ? databases
      : (others.get(ref.documentId) ?? [])
    ).find((db) => db.id === ref.databaseId);
  return databases.map((db) => ({
    db,
    computed: computeDatabase(db, { related }),
  }));
}

/**
 * Rows of a database as plain objects keyed by column name, with values as
 * people read them (option names, dates, linked row titles, formula results).
 *
 * @param computed calculated database.
 * @returns the rows.
 */
export function plainRows(
  computed: ReturnType<typeof computeDatabase>
): Record<string, unknown>[] {
  return computed.rows.map((row) => {
    const values: Record<string, unknown> = { id: row.id };
    for (const column of computed.columns) {
      const links = row.links?.[column.id];
      values[column.name] = links
        ? links.map((link) => link.title)
        : row.errors?.[column.id]
          ? `#ОШИБКА: ${row.errors[column.id]}`
          : displayValue(column, row.cells[column.id]) || null;
    }
    return values;
  });
}
