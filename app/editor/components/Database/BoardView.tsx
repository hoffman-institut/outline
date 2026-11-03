import { PlusIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type { CellValue, Column, Row } from "@shared/editor/lib/database";
import { ColumnType, displayValue, isEmptyValue } from "@shared/editor/lib/database";
import { s } from "@shared/styles";
import { Chip } from "./components";
import { useDatabase } from "./context";

const NONE = "__none__";

/** Kanban board: one lane per option of the grouping select column. */
export function BoardView({ rows }: { rows: Row[] }) {
  const { t } = useTranslation();
  const { data, view, editable, mutator } = useDatabase();
  const groupColumn = data.columns.find(
    (c) => c.id === view.groupBy && c.type === ColumnType.Select
  );
  const [dragOver, setDragOver] = React.useState<string | null>(null);

  if (!groupColumn) {
    return (
      <Notice>
        {t("Choose a select column to group by in “Fields”.")}
      </Notice>
    );
  }

  const lanes = [
    ...(groupColumn.options ?? []).map((option) => ({ id: option.id, option })),
    { id: NONE, option: undefined },
  ];
  const laneOf = (row: Row) => {
    const value = row.cells[groupColumn.id];
    return typeof value === "string" &&
      groupColumn.options?.some((o) => o.id === value)
      ? value
      : NONE;
  };
  const shown = data.columns.filter(
    (c) =>
      !view.hidden.includes(c.id) &&
      c.id !== groupColumn.id &&
      c.id !== data.columns[0]?.id
  );

  const moveTo = (rowId: string, laneId: string) =>
    mutator.setCells(rowId, {
      [groupColumn.id]: laneId === NONE ? null : laneId,
    });

  return (
    <Lanes>
      {lanes.map((lane) => {
        const laneRows = rows.filter((row) => laneOf(row) === lane.id);
        if (lane.id === NONE && laneRows.length === 0 && !dragOver) {
          return null;
        }
        return (
          <Lane
            key={lane.id}
            $over={dragOver === lane.id}
            onDragOver={(event) => {
              if (!editable) {
                return;
              }
              event.preventDefault();
              setDragOver(lane.id);
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(null);
              const rowId = event.dataTransfer.getData("text/x-database-row");
              if (rowId) {
                moveTo(rowId, lane.id);
              }
            }}
          >
            <LaneHeader>
              {lane.option ? (
                <Chip option={lane.option} />
              ) : (
                <Muted>{t("No value")}</Muted>
              )}
              <Muted>{laneRows.length}</Muted>
            </LaneHeader>
            {laneRows.map((row) => (
              <Card key={row.id} row={row} fields={shown} />
            ))}
            {editable && (
              <AddCard
                type="button"
                onClick={() =>
                  mutator.addRow(
                    lane.id === NONE ? {} : { [groupColumn.id]: lane.id }
                  )
                }
              >
                <PlusIcon size={16} />
                {t("New", { context: "database" })}
              </AddCard>
            )}
          </Lane>
        );
      })}
    </Lanes>
  );
}

/** Compact preview of a row used by board and calendar views. */
export function Card({ row, fields }: { row: Row; fields: Column[] }) {
  const { t } = useTranslation();
  const { data, editable, openRow } = useDatabase();
  const titleColumn = data.columns[0];
  const title = titleColumn ? displayValue(titleColumn, row.cells[titleColumn.id]) : "";
  return (
    <CardBox
      draggable={editable}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/x-database-row", row.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => openRow(row.id)}
    >
      <CardTitle>{title || <Muted>{t("Untitled")}</Muted>}</CardTitle>
      {fields.map((column) => (
        <CardField key={column.id} column={column} value={row.cells[column.id]} />
      ))}
    </CardBox>
  );
}

function CardField({ column, value }: { column: Column; value: CellValue | undefined }) {
  if (isEmptyValue(value)) {
    return null;
  }
  if (column.type === ColumnType.Select || column.type === ColumnType.MultiSelect) {
    const ids = Array.isArray(value) ? value : [String(value)];
    return (
      <FieldChips>
        {ids
          .map((id) => column.options?.find((o) => o.id === id))
          .map((option) => option && <Chip key={option.id} option={option} />)}
      </FieldChips>
    );
  }
  if (column.type === ColumnType.Person) {
    return null;
  }
  return <FieldText>{displayValue(column, value)}</FieldText>;
}

const Lanes = styled.div`
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 8px 0 12px;
  align-items: flex-start;
`;

const Lane = styled.div<{ $over: boolean }>`
  flex: 0 0 260px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  border-radius: 8px;
  background: ${(props) =>
    props.$over
      ? props.theme.listItemHoverBackground
      : props.theme.backgroundSecondary};
`;

const LaneHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 4px 4px;
`;

const CardBox = styled.div`
  padding: 8px 10px;
  border-radius: 6px;
  background: ${s("background")};
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08), 0 0 0 1px ${s("divider")};
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;

  &:hover {
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1), 0 0 0 1px ${s("inputBorder")};
  }
`;

const CardTitle = styled.div`
  font-size: 14px;
  font-weight: 500;
  word-break: break-word;
`;

const FieldChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`;

const FieldText = styled.div`
  font-size: 13px;
  color: ${s("textSecondary")};
  word-break: break-word;
`;

const AddCard = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: ${s("textTertiary")};
  font-size: 13px;
  cursor: pointer;

  &:hover {
    background: ${s("listItemHoverBackground")};
    color: ${s("text")};
  }
`;

const Muted = styled.span`
  color: ${s("textTertiary")};
  font-size: 13px;
`;

const Notice = styled.div`
  padding: 16px 8px;
  color: ${s("textTertiary")};
  font-size: 14px;
`;
