import type { EditorView } from "prosemirror-view";
import * as React from "react";
import type {
  CellValue,
  Column,
  DatabaseData,
  SelectOption,
  View,
} from "@shared/editor/lib/database";
import type { ComputedDatabase } from "@shared/editor/lib/databaseCompute";
import type { LinkedDatabases } from "./linked";
import type { Mutator } from "./mutations";

export type DatabaseContextValue = {
  /** Stored data: the only source for changes. */
  data: DatabaseData;
  /** Data with calculated columns, for display, sorting and filters. */
  computed: ComputedDatabase;
  /**
   * The database: the block and its document. For a linked database these
   * are the source, which forms, relations and backlinks refer to.
   */
  databaseId: string;
  documentId?: string;
  /** The document open in the editor. */
  editorDocumentId?: string;
  /** Whether columns, title and templates can be changed. */
  schemaEditable: boolean;
  /** Whether rows can get pages (the source is in this document). */
  rowPages: boolean;
  /** Shown in a linked database: changes go to its source. */
  isLinkedView: boolean;
  /** Databases that relations of this block link to. */
  linked: LinkedDatabases;
  editorView: EditorView;
  view: View;
  mutator: Mutator;
  editable: boolean;
  /** Adds an option to a select column and returns it. */
  createOption: (column: Column, name: string) => SelectOption;
  /** Opens the editor of a row (card). */
  openRow: (rowId: string) => void;
  /**
   * Saves a changed view. Readers change their own copy, which lives until
   * the page is reloaded.
   */
  updateView: (view: View) => void;
  /**
   * Adds a row that matches the filters of the view, at the top or the
   * bottom as the view says.
   *
   * @returns the id of the new row.
   */
  addRow: (cells?: Record<string, CellValue>) => string;
  /** Text of the search box. */
  search: string;
  setSearch: (search: string) => void;
  userName: (id: string) => string | undefined;
};

export const DatabaseContext = React.createContext<DatabaseContextValue | null>(
  null
);

export function useDatabase(): DatabaseContextValue {
  const value = React.useContext(DatabaseContext);
  if (!value) {
    throw new Error("useDatabase must be used inside a database block");
  }
  return value;
}

/** Updates the current view, keeping the other views. */
export function useUpdateView() {
  const { view, updateView } = useDatabase();
  return React.useCallback(
    (patch: Partial<View>) => updateView({ ...view, ...patch }),
    [view, updateView]
  );
}
