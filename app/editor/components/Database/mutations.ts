import type { Node as ProsemirrorNode } from "prosemirror-model";
import type { Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type {
  CellValue,
  Column,
  DatabaseRef,
  RowTemplate,
  View,
} from "@shared/editor/lib/database";
import { ColumnType, newId, nextAutoNumber } from "@shared/editor/lib/database";
import { client } from "~/utils/ApiClient";
import { databasePos } from "./linked";

type Located = { pos: number; node: ProsemirrorNode };

type Cells = Record<string, CellValue>;

/** Changes of a database, as the views make them. */
export interface Mutator {
  setAttrs(
    patch: Partial<{
      title: string;
      columns: Column[];
      views: View[];
      templates: RowTemplate[];
    }>
  ): void;
  setView(view: View): void;
  setCells(rowId: string, cells: Cells): void;
  setRowDoc(rowId: string, docId: string | null): void;
  addRow(cells?: Cells, beforeRowId?: string): string;
  deleteRow(rowId: string): void;
  duplicateRow(rowId: string): void;
  moveRow(rowId: string, toIndex: number): void;
  setColumns(
    columns: Column[],
    transform?: (cells: Cells, rowId: string) => Cells
  ): void;
  deleteDatabase(): void;
}

/**
 * Applies changes to one database block as ProseMirror transactions, so they
 * go through undo history and collaborative editing like any other edit.
 */
export class DatabaseMutator implements Mutator {
  constructor(
    private view: EditorView,
    private getPos: () => number | undefined
  ) {}

  private locate(): Located | undefined {
    const pos = this.getPos();
    if (pos === undefined) {
      return undefined;
    }
    const node = this.view.state.doc.nodeAt(pos);
    return node?.type.name === "database" ? { pos, node } : undefined;
  }

  private findRow(db: Located, rowId: string) {
    let found:
      | { pos: number; node: ProsemirrorNode; index: number }
      | undefined;
    db.node.forEach((child, offset, index) => {
      if (child.attrs.id === rowId) {
        found = { pos: db.pos + 1 + offset, node: child, index };
      }
    });
    return found;
  }

  /** Cells of a new row with the next numbers of auto number columns. */
  private numbered(db: Located, cells: Record<string, CellValue>) {
    const columns = (db.node.attrs.columns ?? []) as Column[];
    const rows: { cells: Record<string, CellValue> }[] = [];
    db.node.forEach((child) => rows.push({ cells: child.attrs.cells ?? {} }));
    const result = { ...cells };
    for (const column of columns) {
      if (column.type === ColumnType.AutoNumber) {
        result[column.id] = nextAutoNumber(rows, column.id);
      }
    }
    return result;
  }

  private dispatch(build: (tr: Transaction, db: Located) => void) {
    const db = this.locate();
    if (!db) {
      return;
    }
    const tr = this.view.state.tr;
    build(tr, db);
    if (tr.docChanged) {
      this.view.dispatch(tr);
    }
  }

  /** Updates database attributes (title, columns, views). */
  setAttrs(
    patch: Partial<{
      title: string;
      columns: Column[];
      views: View[];
      templates: RowTemplate[];
    }>
  ) {
    this.dispatch((tr, db) => {
      tr.setNodeMarkup(db.pos, undefined, { ...db.node.attrs, ...patch });
    });
  }

  setView(view: View) {
    this.dispatch((tr, db) => {
      const views = (db.node.attrs.views as View[]).map((v) =>
        v.id === view.id ? view : v
      );
      tr.setNodeMarkup(db.pos, undefined, { ...db.node.attrs, views });
    });
  }

  /** Sets one or more cells of a row. */
  setCells(rowId: string, cells: Record<string, CellValue>) {
    this.dispatch((tr, db) => {
      const row = this.findRow(db, rowId);
      if (row) {
        tr.setNodeMarkup(row.pos, undefined, {
          ...row.node.attrs,
          cells: { ...row.node.attrs.cells, ...cells },
        });
      }
    });
  }

  setRowDoc(rowId: string, docId: string | null) {
    this.dispatch((tr, db) => {
      const row = this.findRow(db, rowId);
      if (row) {
        tr.setNodeMarkup(row.pos, undefined, { ...row.node.attrs, docId });
      }
    });
  }

  /**
   * Adds a row.
   *
   * @param cells initial values.
   * @param beforeRowId insert before this row, otherwise at the end.
   * @returns the id of the new row.
   */
  addRow(cells: Record<string, CellValue> = {}, beforeRowId?: string): string {
    const id = newId();
    this.dispatch((tr, db) => {
      const row = this.view.state.schema.nodes.database_row.create({
        id,
        cells: this.numbered(db, cells),
      });
      const before = beforeRowId ? this.findRow(db, beforeRowId) : undefined;
      tr.insert(before ? before.pos : db.pos + db.node.nodeSize - 1, row);
    });
    return id;
  }

  deleteRow(rowId: string) {
    this.dispatch((tr, db) => {
      const row = this.findRow(db, rowId);
      if (row) {
        tr.delete(row.pos, row.pos + row.node.nodeSize);
      }
    });
  }

  duplicateRow(rowId: string) {
    this.dispatch((tr, db) => {
      const row = this.findRow(db, rowId);
      if (row) {
        const copy = this.view.state.schema.nodes.database_row.create({
          id: newId(),
          cells: this.numbered(db, row.node.attrs.cells ?? {}),
        });
        tr.insert(row.pos + row.node.nodeSize, copy);
      }
    });
  }

  /** Moves a row to a new index in the manual (document) order. */
  moveRow(rowId: string, toIndex: number) {
    this.dispatch((tr, db) => {
      const row = this.findRow(db, rowId);
      if (!row || row.index === toIndex) {
        return;
      }
      tr.delete(row.pos, row.pos + row.node.nodeSize);
      const after = tr.doc.nodeAt(db.pos);
      if (!after) {
        return;
      }
      let insertAt = db.pos + after.nodeSize - 1;
      after.forEach((child, offset, index) => {
        if (index === toIndex) {
          insertAt = db.pos + 1 + offset;
        }
      });
      tr.insert(insertAt, row.node);
    });
  }

  /**
   * Replaces the columns and, in the same transaction, rewrites every row's
   * cells (used for type changes and column deletion).
   */
  setColumns(
    columns: Column[],
    transform?: (
      cells: Record<string, CellValue>,
      rowId: string
    ) => Record<string, CellValue>
  ) {
    this.dispatch((tr, db) => {
      tr.setNodeMarkup(db.pos, undefined, { ...db.node.attrs, columns });
      if (!transform) {
        return;
      }
      db.node.forEach((child, offset) => {
        tr.setNodeMarkup(db.pos + 1 + offset, undefined, {
          ...child.attrs,
          cells: transform(child.attrs.cells ?? {}, child.attrs.id),
        });
      });
    });
  }

  /** Removes the whole database block from the document. */
  deleteDatabase() {
    this.dispatch((tr, db) => {
      tr.delete(db.pos, db.pos + db.node.nodeSize);
    });
  }
}

/**
 * Changes made in a linked database. Views live in the linked block. Data
 * goes to the source block: through the editor when it is in this document,
 * through the API (rows only) when it is in another one.
 */
export class LinkedMutator implements Mutator {
  constructor(
    private view: EditorView,
    private getPos: () => number | undefined,
    private source: DatabaseRef,
    /** Whether the source block is in the document of the editor. */
    private local: boolean,
    /** Cells of a row of the source, for duplicates through the API. */
    private rowCells: (rowId: string) => Cells | undefined,
    /** Called after an API change, to reload the source. */
    private onChange: () => void
  ) {}

  private sourceMutator() {
    return new DatabaseMutator(this.view, () =>
      databasePos(this.view.state.doc, this.source.databaseId)
    );
  }

  private own() {
    const pos = this.getPos();
    const node = pos === undefined ? null : this.view.state.doc.nodeAt(pos);
    return pos !== undefined && node?.type.name === "database_view"
      ? { pos, node }
      : undefined;
  }

  private setOwn(attrs: Record<string, unknown>) {
    const own = this.own();
    if (own) {
      this.view.dispatch(
        this.view.state.tr.setNodeMarkup(own.pos, undefined, {
          ...own.node.attrs,
          ...attrs,
        })
      );
    }
  }

  private api(path: string, body: Record<string, unknown>) {
    void client
      .post(path, { ...this.source, ...body })
      .finally(() => this.onChange());
  }

  setAttrs(patch: Parameters<Mutator["setAttrs"]>[0]) {
    const { views, ...rest } = patch;
    if (views) {
      this.setOwn({ views });
    }
    if (this.local && Object.keys(rest).length) {
      this.sourceMutator().setAttrs(rest);
    }
  }

  setView(view: View) {
    const views = (this.own()?.node.attrs.views ?? []) as View[];
    this.setOwn({ views: views.map((v) => (v.id === view.id ? view : v)) });
  }

  setCells(rowId: string, cells: Cells) {
    if (this.local) {
      this.sourceMutator().setCells(rowId, cells);
    } else {
      this.api("/databases.updateRow", { rowId, cells });
    }
  }

  setRowDoc(rowId: string, docId: string | null) {
    if (this.local) {
      this.sourceMutator().setRowDoc(rowId, docId);
    }
  }

  addRow(cells: Cells = {}, beforeRowId?: string): string {
    if (this.local) {
      return this.sourceMutator().addRow(cells, beforeRowId);
    }
    const rowId = newId();
    this.api("/databases.addRow", { rowId, cells });
    return rowId;
  }

  deleteRow(rowId: string) {
    if (this.local) {
      this.sourceMutator().deleteRow(rowId);
    } else {
      this.api("/databases.deleteRow", { rowId });
    }
  }

  duplicateRow(rowId: string) {
    if (this.local) {
      this.sourceMutator().duplicateRow(rowId);
    } else {
      this.api("/databases.addRow", {
        rowId: newId(),
        cells: this.rowCells(rowId) ?? {},
      });
    }
  }

  moveRow(rowId: string, toIndex: number) {
    if (this.local) {
      this.sourceMutator().moveRow(rowId, toIndex);
    }
  }

  setColumns(
    columns: Column[],
    transform?: (cells: Cells, rowId: string) => Cells
  ) {
    if (this.local) {
      this.sourceMutator().setColumns(columns, transform);
    }
  }

  /** Removes the linked block; the source database stays. */
  deleteDatabase() {
    const own = this.own();
    if (own) {
      this.view.dispatch(
        this.view.state.tr.delete(own.pos, own.pos + own.node.nodeSize)
      );
    }
  }
}
