import * as React from "react";
import type {
  Column,
  DatabaseData,
  SelectOption,
  View,
} from "@shared/editor/lib/database";
import type { ComputedDatabase } from "@shared/editor/lib/databaseCompute";
import type { DatabaseMutator } from "./mutations";

export type DatabaseContextValue = {
  /** Stored data: the only source for changes. */
  data: DatabaseData;
  /** Data with calculated formula columns, for display, sorting and filters. */
  computed: ComputedDatabase;
  view: View;
  mutator: DatabaseMutator;
  editable: boolean;
  /** Adds an option to a select column and returns it. */
  createOption: (column: Column, name: string) => SelectOption;
  /** Opens the editor of a row (card). */
  openRow: (rowId: string) => void;
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
  const { view, mutator } = useDatabase();
  return React.useCallback(
    (patch: Partial<View>) => mutator.setView({ ...view, ...patch }),
    [view, mutator]
  );
}
