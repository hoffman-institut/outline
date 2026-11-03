import { MoreIcon, PlusIcon, TrashIcon, DuplicateIcon, OpenIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type { Column, Row } from "@shared/editor/lib/database";
import { ColumnType, newId } from "@shared/editor/lib/database";
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

function HeaderCell({ column }: { column: Column }) {
  const { editable } = useDatabase();
  const [open, setOpen] = React.useState(false);
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
  return (
    <th>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger>
          <HeaderButton type="button">{label}</HeaderButton>
        </PopoverTrigger>
        <PopoverContent width={300} shrink align="start" onClick={stop}>
          <ColumnMenu column={column} onClose={() => setOpen(false)} />
        </PopoverContent>
      </Popover>
    </th>
  );
}

function TableRow({
  row,
  columns,
  autoFocus,
}: {
  row: Row;
  columns: Column[];
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const { editable, mutator, createOption, openRow } = useDatabase();
  const [menuOpen, setMenuOpen] = React.useState(false);
  return (
    <tr>
      <td>
        {editable && (
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger>
              <RowHandle type="button" aria-label={t("Row actions")}>
                <MoreIcon size={18} />
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
            onChange={(value) => mutator.setCells(row.id, { [column.id]: value })}
            onCreateOption={(name) => createOption(column, name)}
          />
        </td>
      ))}
      {editable && <td />}
    </tr>
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

const RowHandle = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 34px;
  border: 0;
  background: none;
  color: ${s("textTertiary")};
  cursor: pointer;
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
