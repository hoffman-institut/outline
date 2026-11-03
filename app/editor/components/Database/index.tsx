import { observer } from "mobx-react";
import * as React from "react";
import styled, { css } from "styled-components";
import type {
  Column,
  DatabaseRef,
  SelectOption,
} from "@shared/editor/lib/database";
import {
  ViewType,
  newId,
  nextOptionColor,
  rowsForView,
} from "@shared/editor/lib/database";
import { computeDatabase } from "@shared/editor/lib/databaseCompute";
import { databaseFromNode } from "@shared/editor/nodes/Database";
import type { ComponentProps } from "@shared/editor/types";
import { s } from "@shared/styles";
import { useDocumentContext } from "~/components/DocumentContext";
import useStores from "~/hooks/useStores";
import { BoardView } from "./BoardView";
import { CalendarView } from "./CalendarView";
import { RowPanel } from "./RowPanel";
import { TableView } from "./TableView";
import { DatabaseTitle, ViewToolbar } from "./ViewToolbar";
import type { DatabaseContextValue } from "./context";
import { DatabaseContext } from "./context";
import { useLinkedDatabases } from "./linked";
import { DatabaseMutator } from "./mutations";

const storageKey = (id: string) => `database-view:${id}`;

function readActiveView(id: string | null): string | null {
  try {
    return id ? window.localStorage.getItem(storageKey(id)) : null;
  } catch {
    return null;
  }
}

/**
 * The database block: title, view tabs with sort / filter / fields, and the
 * active view (table, board or calendar). All data lives in the node.
 */
function DatabaseBlock({
  node,
  view: editorView,
  getPos,
  isEditable,
  isSelected,
}: ComponentProps) {
  const { users } = useStores();
  const { document } = useDocumentContext();
  const data = React.useMemo(() => databaseFromNode(node), [node]);
  const linked = useLinkedDatabases(
    data.columns
      .map((column) => column.relation)
      .filter((ref): ref is DatabaseRef => !!ref),
    editorView,
    document?.id
  );
  const mutator = React.useMemo(
    () => new DatabaseMutator(editorView, getPos),
    [editorView, getPos]
  );
  const [activeId, setActiveId] = React.useState<string | null>(() =>
    readActiveView(node.attrs.id)
  );
  const [openRowId, setOpenRowId] = React.useState<string | null>(null);
  const [focusRowId, setFocusRowId] = React.useState<string | undefined>();
  const activeView = data.views.find((v) => v.id === activeId) ?? data.views[0];

  // Columns are read from the latest node when an option is created, so
  // several quick edits do not overwrite each other.
  const latest = React.useRef(data);
  latest.current = data;

  const createOption = React.useCallback(
    (column: Column, name: string): SelectOption => {
      const current =
        latest.current.columns.find((c) => c.id === column.id) ?? column;
      const option: SelectOption = {
        id: newId(),
        name,
        color: nextOptionColor(current.options),
      };
      mutator.setColumns(
        latest.current.columns.map((c) =>
          c.id === column.id
            ? { ...c, options: [...(c.options ?? []), option] }
            : c
        )
      );
      return option;
    },
    [mutator]
  );

  const selectView = (id: string) => {
    setActiveId(id);
    try {
      window.localStorage.setItem(storageKey(node.attrs.id), id);
    } catch {
      // Remembering the tab is a convenience only.
    }
  };

  if (!activeView) {
    return null;
  }

  const computed = computeDatabase(data, {
    userName: (id) => users.get(id)?.name,
    related: linked.get,
  });
  const rows = rowsForView(computed, activeView);
  const openRow = computed.rows.find((row) => row.id === openRowId);

  const context: DatabaseContextValue = {
    data,
    computed,
    databaseId: node.attrs.id,
    documentId: document?.id,
    linked,
    editorView,
    view: activeView,
    mutator,
    editable: isEditable,
    createOption,
    openRow: setOpenRowId,
  };

  return (
    <DatabaseContext.Provider value={context}>
      <Wrapper data-database-ui contentEditable={false} $selected={isSelected}>
        <DatabaseTitle />
        <ViewToolbar
          onSelectView={selectView}
          onAddRow={() => {
            const id = mutator.addRow();
            if (activeView.type === ViewType.Table) {
              setFocusRowId(id);
            } else {
              setOpenRowId(id);
            }
          }}
        />
        {openRow && (
          <RowPanel row={openRow} onClose={() => setOpenRowId(null)} />
        )}
        {activeView.type === ViewType.Board ? (
          <BoardView rows={rows} />
        ) : activeView.type === ViewType.Calendar ? (
          <CalendarView rows={rows} />
        ) : (
          <TableView rows={rows} focusRowId={focusRowId} />
        )}
      </Wrapper>
    </DatabaseContext.Provider>
  );
}

const Wrapper = styled.div<{ $selected: boolean }>`
  margin: 12px 0;
  color: ${s("text")};
  font-size: 14px;
  white-space: normal;
  cursor: default;
  user-select: text;
  border-radius: 6px;
  ${(props) =>
    props.$selected &&
    css`
      outline: 2px solid ${props.theme.accent};
      outline-offset: 4px;
    `}

  input,
  select,
  button {
    font-family: inherit;
  }
`;

export default observer(DatabaseBlock);
