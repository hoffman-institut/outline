import { PlusIcon, TrashIcon, DuplicateIcon, OpenIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type { Column, Row } from "@shared/editor/lib/database";
import {
  ColumnType,
  moveColumn,
  newId,
  rowDropIndex,
} from "@shared/editor/lib/database";
import { s } from "@shared/styles";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/primitives/Popover";
import { Cell } from "./Cell";
import { ColumnMenu, ColumnTypeIcon } from "./ColumnMenu";
import { MenuRow, PopoverBody, stop } from "./components";
import { useDatabase } from "./context";

const defaultWidth = (type: ColumnType) =>
  type === ColumnType.Checkbox
    ? 90
    : type === ColumnType.Number || type === ColumnType.Date
      ? 140
      : 200;

/** Spreadsheet-like view: one row per record, one column per field. */
export function TableView({
  rows,
  focusRowId,
}: {
  rows: Row[];
  focusRowId?: string;
}) {
  const { t } = useTranslation();
  const { data, view, editable, mutator } = useDatabase();
  const columns = data.columns.filter((c) => !view.hidden.includes(c.id));
  // Manual order only makes sense when the view is not sorted.
  const reorderable = editable && view.sort.length === 0;
  const [drop, setDrop] = React.useState<{
    rowId: string;
    after: boolean;
  } | null>(null);

  const dropRow = (rowId: string, targetId: string, after: boolean) => {
    setDrop(null);
    const index = rowDropIndex(data.rows, rowId, targetId, after);
    if (index >= 0) {
      mutator.moveRow(rowId, index);
    }
  };

  return (
    <Scroll>
      <Table>
        <colgroup>
          <col style={{ width: 32 }} />
          {columns.map((column) => (
            <col
              key={column.id}
              style={{ width: column.width ?? defaultWidth(column.type) }}
            />
          ))}
          {editable && <col style={{ width: 40 }} />}
        </colgroup>
        <thead>
          <tr>
            <th />
            {columns.map((column) => (
              <HeaderCell key={column.id} column={column} />
            ))}
            {editable && (
              <th>
                <AddColumn
                  type="button"
                  aria-label={t("Add column")}
                  onClick={() =>
                    mutator.setColumns([
                      ...data.columns,
                      { id: newId(), name: t("Column"), type: ColumnType.Text },
                    ])
                  }
                >
                  <PlusIcon size={18} />
                </AddColumn>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <TableRow
              key={row.id}
              row={row}
              columns={columns}
              autoFocus={row.id === focusRowId}
              reorderable={reorderable}
              drop={
                drop?.rowId === row.id
                  ? drop.after
                    ? "after"
                    : "before"
                  : null
              }
              onDragOverRow={(after) => setDrop({ rowId: row.id, after })}
              onDropRow={(rowId, after) => dropRow(rowId, row.id, after)}
              onDragEnd={() => setDrop(null)}
            />
          ))}
        </tbody>
      </Table>
      {editable && (
        <NewRow type="button" onClick={() => mutator.addRow()}>
          <PlusIcon size={18} />
          {t("New row")}
        </NewRow>
      )}
      {rows.length === 0 && !editable && <Empty>{t("No rows")}</Empty>}
    </Scroll>
  );
}

const COLUMN_DRAG = "text/x-database-column";

function HeaderCell({ column }: { column: Column }) {
  const { editable, data, mutator } = useDatabase();
  const [open, setOpen] = React.useState(false);
  const [dropSide, setDropSide] = React.useState<"before" | "after" | null>(
    null
  );
  const label = (
    <>
      <ColumnTypeIcon type={column.type} />
      <span>{column.name}</span>
    </>
  );
  if (!editable) {
    return (
      <th>
        <HeaderButton as="div">{label}</HeaderButton>
      </th>
    );
  }
  // Headers are dragged to reorder columns; a line shows the drop side.
  return (
    <HeaderTh
      draggable
      $drop={dropSide}
      onDragStart={(event) => {
        event.dataTransfer.setData(COLUMN_DRAG, column.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(event) => {
        if (!Array.from(event.dataTransfer.types).includes(COLUMN_DRAG)) {
          return;
        }
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        setDropSide(
          event.clientX < rect.left + rect.width / 2 ? "before" : "after"
        );
      }}
      onDragLeave={() => setDropSide(null)}
      onDragEnd={() => setDropSide(null)}
      onDrop={(event) => {
        const id = event.dataTransfer.getData(COLUMN_DRAG);
        const after = dropSide === "after";
        setDropSide(null);
        if (!id) {
          return;
        }
        event.preventDefault();
        const columns = moveColumn(data.columns, id, column.id, after);
        if (columns !== data.columns) {
          mutator.setColumns(columns);
        }
      }}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger>
          <HeaderButton type="button">{label}</HeaderButton>
        </PopoverTrigger>
        <PopoverContent width={300} shrink align="start" onClick={stop}>
          <ColumnMenu column={column} onClose={() => setOpen(false)} />
        </PopoverContent>
      </Popover>
    </HeaderTh>
  );
}

const ROW_DRAG = "text/x-database-row-order";

function TableRow({
  row,
  columns,
  autoFocus,
  reorderable,
  drop,
  onDragOverRow,
  onDropRow,
  onDragEnd,
}: {
  row: Row;
  columns: Column[];
  autoFocus?: boolean;
  reorderable: boolean;
  drop: "before" | "after" | null;
  onDragOverRow: (after: boolean) => void;
  onDropRow: (rowId: string, after: boolean) => void;
  onDragEnd: () => void;
}) {
  const { t } = useTranslation();
  const { editable, mutator, createOption, openRow } = useDatabase();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const isBelow = (event: React.DragEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY > rect.top + rect.height / 2;
  };
  return (
    <DropRow
      $drop={drop}
      onDragOver={(event) => {
        if (!Array.from(event.dataTransfer.types).includes(ROW_DRAG)) {
          return;
        }
        event.preventDefault();
        onDragOverRow(isBelow(event));
      }}
      onDrop={(event) => {
        const rowId = event.dataTransfer.getData(ROW_DRAG);
        if (rowId) {
          event.preventDefault();
          onDropRow(rowId, isBelow(event));
        }
      }}
    >
      <td>
        {editable && (
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger>
              <RowHandle
                type="button"
                aria-label={t("Row actions")}
                draggable={reorderable}
                $grab={reorderable}
                title={
                  reorderable
                    ? t("Drag to move, click for actions")
                    : t("Remove sorting to reorder rows manually")
                }
                onDragStart={(event) => {
                  event.dataTransfer.setData(ROW_DRAG, row.id);
                  event.dataTransfer.effectAllowed = "move";
                  const tr = event.currentTarget.closest("tr");
                  if (tr) {
                    event.dataTransfer.setDragImage(tr, 16, 17);
                  }
                }}
                onDragEnd={onDragEnd}
              >
                <Grip aria-hidden>⠿</Grip>
              </RowHandle>
            </PopoverTrigger>
            <PopoverContent width={220} shrink align="start" onClick={stop}>
              <PopoverBody>
                <MenuRow
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    openRow(row.id);
                  }}
                >
                  <OpenIcon size={18} />
                  {t("Open")}
                </MenuRow>
                <MenuRow
                  type="button"
                  onClick={() => {
                    mutator.addRow({}, row.id);
                    setMenuOpen(false);
                  }}
                >
                  <PlusIcon size={18} />
                  {t("Insert row above")}
                </MenuRow>
                <MenuRow
                  type="button"
                  onClick={() => {
                    mutator.duplicateRow(row.id);
                    setMenuOpen(false);
                  }}
                >
                  <DuplicateIcon size={18} />
                  {t("Duplicate")}
                </MenuRow>
                <MenuRow
                  type="button"
                  $danger
                  onClick={() => mutator.deleteRow(row.id)}
                >
                  <TrashIcon size={18} />
                  {t("Delete row")}
                </MenuRow>
              </PopoverBody>
            </PopoverContent>
          </Popover>
        )}
      </td>
      {columns.map((column, index) => (
        <td key={column.id}>
          <Cell
            column={column}
            value={row.cells[column.id]}
            editable={editable}
            autoFocus={autoFocus && index === 0}
            onChange={(value) =>
              mutator.setCells(row.id, { [column.id]: value })
            }
            onCreateOption={(name) => createOption(column, name)}
          />
        </td>
      ))}
      {editable && <td />}
    </DropRow>
  );
}

const Scroll = styled.div`
  overflow-x: auto;
  margin: 0 0 4px;
`;

const Table = styled.table`
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  table-layout: fixed;

  th,
  td {
    border: 1px solid ${s("divider")};
    padding: 0;
    vertical-align: top;
    background: none;
  }

  th:first-child,
  td:first-child {
    border-left: 0;
    border-right: 0;
  }

  th:last-child,
  td:last-child {
    border-right: 0;
  }

  thead th {
    border-top: 0;
    font-weight: 500;
  }

  tr:hover td:first-child button {
    opacity: 1;
  }
`;

const HeaderTh = styled.th<{ $drop: "before" | "after" | null }>`
  && {
    box-shadow: ${(props) =>
      props.$drop === "before"
        ? `inset 3px 0 0 ${props.theme.accent}`
        : props.$drop === "after"
          ? `inset -3px 0 0 ${props.theme.accent}`
          : "none"};
  }
`;

const HeaderButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 34px;
  padding: 0 8px;
  border: 0;
  background: none;
  color: ${s("textSecondary")};
  font-size: 14px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  svg {
    flex-shrink: 0;
  }
`;

// A line above or below the row shows where a dragged row will land.
const DropRow = styled.tr<{ $drop: "before" | "after" | null }>`
  && > td {
    box-shadow: ${(props) =>
      props.$drop === "before"
        ? `inset 0 3px 0 ${props.theme.accent}`
        : props.$drop === "after"
          ? `inset 0 -3px 0 ${props.theme.accent}`
          : "none"};
  }
`;

const Grip = styled.span`
  font-size: 16px;
  line-height: 1;
  letter-spacing: -1px;
`;

const RowHandle = styled.button<{ $grab?: boolean }>`
  cursor: ${(props) => (props.$grab ? "grab" : "pointer")};
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 34px;
  border: 0;
  background: none;
  color: ${s("textTertiary")};
  opacity: 0;

  &:focus-visible,
  &[data-state="open"] {
    opacity: 1;
  }
`;

const AddColumn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 34px;
  border: 0;
  background: none;
  color: ${s("textTertiary")};
  cursor: pointer;

  &:hover {
    color: ${s("text")};
  }
`;

const NewRow = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  height: 34px;
  padding: 0 8px;
  border: 0;
  border-bottom: 1px solid ${s("divider")};
  background: none;
  color: ${s("textTertiary")};
  font-size: 14px;
  cursor: pointer;

  &:hover {
    background: ${s("listItemHoverBackground")};
    color: ${s("text")};
  }
`;

const Empty = styled.div`
  padding: 12px 8px;
  color: ${s("textTertiary")};
  font-size: 14px;
`;
