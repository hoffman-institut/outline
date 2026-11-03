import Router from "@koa/router";
import { Node } from "prosemirror-model";
import type { Transaction } from "prosemirror-state";
import { EditorState } from "prosemirror-state";
import type { Transaction as DbTransaction } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { updateYFragment, yDocToProsemirrorJSON } from "y-prosemirror";
import * as Y from "yjs";
import type {
  CellValue,
  Column,
  DatabaseData,
} from "@shared/editor/lib/database";
import {
  ColumnType,
  ViewType,
  nextAutoNumber,
  normalizeDatabase,
  parseDateValue,
} from "@shared/editor/lib/database";
import { calculatedTypes } from "@shared/editor/lib/databaseCompute";
import type { ProsemirrorData } from "@shared/types";
import { schema } from "@server/editor";
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from "@server/errors";
import Logger from "@server/logging/Logger";
import auth from "@server/middlewares/authentication";
import { rateLimiter } from "@server/middlewares/rateLimiter";
import { transaction } from "@server/middlewares/transaction";
import validate from "@server/middlewares/validate";
import { Document, User } from "@server/models";
import { DocumentHelper } from "@server/models/helpers/DocumentHelper";
import { sequelize } from "@server/storage/database";
import { authorize, can } from "@server/policies";
import type { APIContext } from "@server/types";
import { RateLimiterStrategy } from "@server/utils/RateLimiter";
import * as T from "./schema";

/**
 * Rows of database blocks changed through the API (forms, rows created from
 * a relation in another document, automations). Changes are applied to the
 * collaborative state like an edit in the editor, so open editors receive
 * them and edits of other people are kept.
 */
const router = new Router();

type Located = { node: Node; pos: number; data: DatabaseData };

/**
 * Applies a change to a database block of a document state.
 *
 * @param state collaborative state of the document.
 * @param databaseId the database block.
 * @param edit builds the change.
 * @returns the new state and content.
 */
function editDatabase(
  state: Uint8Array,
  databaseId: string,
  edit: (db: Located, tr: Transaction) => void
): { state: Buffer; content: ProsemirrorData } {
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
  };
}

/**
 * Checks and converts values from the API to the types of the columns.
 * Calculated and auto number columns are ignored.
 *
 * @param columns the columns of the database.
 * @param input values by column id.
 * @param allowed columns that may be set, all when undefined.
 * @returns stored cell values.
 */
function sanitizeCells(
  columns: Column[],
  input: Record<string, unknown>,
  allowed?: Set<string>
): Record<string, CellValue> {
  const cells: Record<string, CellValue> = {};
  const optionId = (column: Column, value: unknown) =>
    column.options?.find((o) => o.id === value || o.name === value)?.id;
  const list = (value: unknown) =>
    (Array.isArray(value) ? value : value === null ? [] : [value]).filter(
      (v): v is string => typeof v === "string"
    );

  for (const [columnId, value] of Object.entries(input)) {
    const column = columns.find((c) => c.id === columnId);
    if (
      !column ||
      (allowed && !allowed.has(columnId)) ||
      calculatedTypes.includes(column.type) ||
      column.type === ColumnType.AutoNumber
    ) {
      continue;
    }
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
      default:
        cells[columnId] = String(value);
    }
  }
  return cells;
}

/**
 * Loads a document for a change of its state, locked for the transaction.
 */
async function loadForChange(
  user: User,
  documentId: string,
  transaction: DbTransaction
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

/** Whether the document still holds a row, after saves of open editors. */
async function hasRow(documentId: string, databaseId: string, rowId: string) {
  const document = await Document.unscoped().findOne({
    where: { id: documentId },
    attributes: ["id", "content"],
  });
  let found = false;
  const visit = (node: ProsemirrorData | undefined, inDatabase: boolean) => {
    if (!node || found) {
      return;
    }
    if (
      inDatabase &&
      node.type === "database_row" &&
      node.attrs?.id === rowId
    ) {
      found = true;
      return;
    }
    const isTarget = node.type === "database" && node.attrs?.id === databaseId;
    node.content?.forEach((child) => visit(child, inDatabase || isTarget));
  };
  visit(document?.content ?? undefined, false);
  return found;
}

/**
 * Adds a row. People who can edit the document may set any column; readers
 * may add rows only through a form view, with the fields of the form.
 */
async function addRow(
  ctx: APIContext<T.DatabasesAddRowReq>,
  rowId: string
): Promise<void> {
  const { documentId, databaseId, cells = {} } = ctx.input.body;
  const { user } = ctx.state.auth;
  await sequelize.transaction(async (transaction) => {
    const document = await loadForChange(user, documentId, transaction);
    const canEdit = can(user, "update", document);
    const updated = editDatabase(
      DocumentHelper.toState(document),
      databaseId,
      ({ node, pos, data }, tr) => {
        const form = data.views.find((v) => v.type === ViewType.Form);
        if (!canEdit && !form) {
          throw AuthorizationError("The database has no form");
        }
        const allowed = canEdit
          ? undefined
          : new Set(
              data.columns
                .filter((c) => !form!.hidden.includes(c.id))
                .map((c) => c.id)
            );
        const values = sanitizeCells(data.columns, cells, allowed);
        const rows: { cells: Record<string, CellValue> }[] = [];
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
      }
    );
    // Hooks notify the collaboration server, which merges the change into
    // the open editors.
    await document.update(
      { state: updated.state, content: updated.content },
      { ...ctx.context, transaction }
    );
  });
}

router.post(
  "databases.addRow",
  rateLimiter(RateLimiterStrategy.OneHundredPerMinute),
  auth(),
  validate(T.DatabasesAddRowSchema),
  async (ctx: APIContext<T.DatabasesAddRowReq>) => {
    const { documentId, databaseId } = ctx.input.body;
    const rowId = uuidv4();
    await addRow(ctx, rowId);

    // An open editor may save its own older state between our save and the
    // merge of our change, dropping the row. Its next save (a few seconds
    // after the merge) restores the row if it was merged, so check later
    // and add the row again only if it is still missing.
    setTimeout(() => {
      void (async () => {
        try {
          if (!(await hasRow(documentId, databaseId, rowId))) {
            Logger.warn("Database row lost after save, adding again", {
              documentId,
              rowId,
            });
            await addRow(ctx, rowId);
          }
        } catch (error) {
          Logger.error("Database row check failed", error as Error);
        }
      })();
    }, 15000);

    ctx.body = { data: { rowId } };
  }
);

router.post(
  "databases.updateRow",
  rateLimiter(RateLimiterStrategy.OneHundredPerMinute),
  auth(),
  validate(T.DatabasesUpdateRowSchema),
  transaction(),
  async (ctx: APIContext<T.DatabasesUpdateRowReq>) => {
    const { documentId, databaseId, rowId, cells } = ctx.input.body;
    const { user } = ctx.state.auth;
    const { transaction } = ctx.state;
    const document = await loadForChange(user, documentId, transaction);
    authorize(user, "update", document);
    const updated = editDatabase(
      DocumentHelper.toState(document),
      databaseId,
      ({ node, pos, data }, tr) => {
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
          cells: { ...row.attrs.cells, ...sanitizeCells(data.columns, cells) },
        });
      }
    );
    await document.update(
      { state: updated.state, content: updated.content },
      { ...ctx.context, transaction }
    );
    ctx.body = { data: { rowId } };
  }
);

export default router;
