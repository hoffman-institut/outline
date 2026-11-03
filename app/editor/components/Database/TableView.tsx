import {
  PlusIcon,
  TrashIcon,
  DuplicateIcon,
  NewDocumentIcon,
  OpenIcon,
} from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type { CellValue, Column, TotalKind } from "@shared/editor/lib/database";
import type { RowGroup } from "@shared/editor/lib/database";
import {
  ColumnType,
  computeTotal,
  displayValue,
  formatDate,
  formatNumber,
  groupRows,
  isEmptyValue,
  treeRows,
  moveColumn,
  newId,
  rowDropIndex,
  totalsFor,
} from "@shared/editor/lib/database";
import type {
  ComputedColumn,
  ComputedRow,
} from "@shared/editor/lib/databaseCompute";
import {
  calculatedTypes,
  isComputed,
} from "@shared/editor/lib/databaseCompute";
import { s } from "@shared/styles";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/primitives/Popover";
import { Cell } from "./Cell";
import { ColumnMenu, ColumnTypeIcon } from "./ColumnMenu";
import {
  CellError,
  Chip,
  MenuRow,
  PopoverBody,
  stop,
  useTotalLabels,
} from "./components";
import { useDatabase, useUpdateView } from "./context";

const defaultWidth = (type: ColumnType) =>
  type === ColumnType.Checkbox
    ? 90
    : type === ColumnType.Number || type === ColumnType.Date
      ? 140
      : 200;

const clampWidth = (width: number) =>
  Math.min(1000, Math.max(60, Math.round(width)));

let measure: HTMLCanvasElement | undefined;

/** Spreadsheet-like view: one row per record, one column per field. */
export function TableView({
  rows,
  focusRowId,
}: {
  rows: ComputedRow[];
  focusRowId?: string;
}) {
  const { t } = useTranslation();
  const {
    data,
    computed,
    view,
    editable,
    schemaEditable,
    mutator,
    addRow,
    userName,
  } = useDatabase();
  const columns = computed.columns.filter((c) => !view.hidden.includes(c.id));
  const groupColumn = computed.columns.find((c) => c.id === view.groupBy);
  const groups = groupColumn
    ? groupRows(groupColumn, rows, { dateUnit: view.groupDate, userName })
    : undefined;
  // Collapsed groups are remembered until the page is reloaded.
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const toggleGroup = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(key)) {
        next.add(key);
      }
      return next;
    });
  // Sub-items are shown under their parents, expanded unless collapsed.
  const subColumn = data.columns.find(
    (c) => c.subitems && c.type === ColumnType.Relation
  );
  const tree = subColumn && !groups ? treeRows(rows, subColumn.id) : undefined;
  const [folded, setFolded] = React.useState<Set<string>>(new Set());
  const shownTree = tree?.filter((item, index, list) => {
    // Hide rows below a folded ancestor.
    for (let i = index - 1, depth = item.depth; i >= 0 && depth > 0; i--) {
      if (list[i].depth < depth) {
        if (folded.has(list[i].row.id)) {
          return false;
        }
        depth = list[i].depth;
      }
    }
    return true;
  });
  const toggleFold = (rowId: string) =>
    setFolded((current) => {
      const next = new Set(current);
      if (!next.delete(rowId)) {
        next.add(rowId);
      }
      return next;
    });
  // Manual order only makes sense when the view is not sorted or grouped.
  const reorderable = schemaEditable && view.sort.length === 0 && !groupColumn;
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

  // Width of a column being resized, shown live and saved on release.
  const [resize, setResize] = React.useState<{
    columnId: string;
    width: number;
  } | null>(null);
  const widthOf = (column: Column) =>
    resize?.columnId === column.id
      ? resize.width
      : (column.width ?? defaultWidth(column.type));

  const saveWidth = (column: Column, width: number) => {
    setResize(null);
    if (width !== (column.width ?? defaultWidth(column.type))) {
      mutator.setColumns(
        data.columns.map((c) => (c.id === column.id ? { ...c, width } : c))
      );
    }
  };

  // Double click on the edge of a header fits the column to its content.
  const fitWidth = (column: ComputedColumn) => {
    const context = (measure ??= document.createElement("canvas")).getContext(
      "2d"
    );
    if (!context) {
      return;
    }
    context.font = `14px ${getComputedStyle(document.body).fontFamily}`;
    const texts = [
      column.name,
      ...rows.map(
        (row) =>
          row.links?.[column.id]?.map((link) => link.title).join(", ") ??
          displayValue(column, row.cells[column.id], userName)
      ),
    ];
    const widest = Math.max(
      ...texts.map((text) => context.measureText(text).width)
    );
    saveWidth(column, clampWidth(Math.min(widest + 44, 600)));
  };

  const showTotals =
    editable || columns.some((column) => view.totals?.[column.id]);

  return (
    <Scroll>
      <Table>
        <colgroup>
          <col style={{ width: 32 }} />
          {columns.map((column) => (
            <col key={column.id} style={{ width: widthOf(column) }} />
          ))}
          {editable && <col style={{ width: 40 }} />}
        </colgroup>
        <thead>
          <tr>
            <th />
            {columns.map((column) => (
              <HeaderCell
                key={column.id}
                column={column}
                width={widthOf(column)}
                onResize={(width) =>
                  setResize({ columnId: column.id, width: clampWidth(width) })
                }
                onResizeEnd={(width) => saveWidth(column, clampWidth(width))}
                onFitWidth={() => fitWidth(column)}
              />
            ))}
            {editable && (
              <th>
                {schemaEditable && (
                  <AddColumn
                    type="button"
                    aria-label={t("Add column")}
                    onClick={() =>
                      mutator.setColumns([
                        ...data.columns,
                        {
                          id: newId(),
                          name: t("Column"),
                          type: ColumnType.Text,
                        },
                      ])
                    }
                  >
                    <PlusIcon size={18} />
                  </AddColumn>
                )}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {groups?.map((group) => (
            <React.Fragment key={group.key}>
              <tr>
                <GroupCell colSpan={columns.length + 2}>
                  <GroupHeader
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                  >
                    {collapsed.has(group.key) ? "▸" : "▾"}
                    <GroupLabel column={groupColumn!} group={group} />
                    <GroupCount>{group.rows.length}</GroupCount>
                  </GroupHeader>
                </GroupCell>
              </tr>
              {!collapsed.has(group.key) &&
                group.rows.map((row) => (
                  <TableRow
                    key={`${group.key}:${row.id}`}
                    row={row}
                    columns={columns}
                    reorderable={false}
                    drop={null}
                    onDragOverRow={() => undefined}
                    onDropRow={() => undefined}
                    onDragEnd={() => undefined}
                  />
                ))}
              {!collapsed.has(group.key) && (
                <GroupTotals columns={columns} rows={group.rows} />
              )}
            </React.Fragment>
          ))}
          {!groups &&
            (
              shownTree ?? rows.map((row) => ({ row, depth: 0, childCount: 0 }))
            ).map(({ row, depth, childCount }) => (
              <TableRow
                key={row.id}
                row={row}
                depth={depth}
                childCount={childCount}
                folded={folded.has(row.id)}
                onToggle={() => toggleFold(row.id)}
                subColumnId={subColumn?.id}
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
          {editable && (
            <tr>
              <td colSpan={columns.length + 2}>
                <NewRow type="button" onClick={() => addRow()}>
                  <PlusIcon size={18} />
                  {t("New row")}
                </NewRow>
              </td>
            </tr>
          )}
        </tbody>
        {showTotals && (
          <Footer>
            <tr>
              <td />
              {columns.map((column) => (
                <TotalCell
                  key={column.id}
                  column={column}
                  values={rows.map((row) => row.cells[column.id])}
                />
              ))}
              {editable && <td />}
            </tr>
          </Footer>
        )}
      </Table>
      {rows.length === 0 && !editable && <Empty>{t("No rows")}</Empty>}
    </Scroll>
  );
}

/** Name of a group: an option chip, a date period, a value. */
function GroupLabel({
  column,
  group,
}: {
  column: ComputedColumn;
  group: RowGroup<ComputedRow>;
}) {
  const { t } = useTranslation();
  const { view } = useDatabase();
  if (!group.key) {
    return <span>{t("No value")}</span>;
  }
  if (column.type === ColumnType.Checkbox) {
    return <span>{group.key === "true" ? t("Checked") : t("Unchecked")}</span>;
  }
  const option = column.options?.find((o) => o.id === group.key);
  if (option) {
    return <Chip option={option} />;
  }
  if (column.type === ColumnType.Date) {
    const date = new Date(`${group.key}T00:00:00Z`);
    switch (view.groupDate ?? "month") {
      case "year":
        return <span>{group.key.slice(0, 4)}</span>;
      case "month":
        return (
          <span>
            {date.toLocaleDateString("ru-RU", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            })}
          </span>
        );
      case "week":
        return (
          <span>
            {t("Week of {{ date }}", { date: formatDate(group.key) })}
          </span>
        );
      default:
        return <span>{formatDate(group.key)}</span>;
    }
  }
  return <span>{group.label}</span>;
}

/** Totals of the rows of one group, under the group. */
function GroupTotals({
  columns,
  rows,
}: {
  columns: ComputedColumn[];
  rows: ComputedRow[];
}) {
  const { view, editable } = useDatabase();
  const labels = useTotalLabels();
  const totals = columns.map((column) => {
    const kind = view.totals?.[column.id];
    return kind && totalsFor(column.type).includes(kind) ? kind : undefined;
  });
  if (!totals.some(Boolean)) {
    return null;
  }
  return (
    <GroupTotalRow>
      <td />
      {columns.map((column, index) => {
        const kind = totals[index];
        return (
          <td key={column.id}>
            {kind && (
              <TotalButton as="div">
                <TotalLabel>{labels[kind]}</TotalLabel>
                {formatTotal(
                  kind,
                  computeTotal(
                    kind,
                    rows.map((row) => row.cells[column.id])
                  ),
                  column
                )}
              </TotalButton>
            )}
          </td>
        );
      })}
      {editable && <td />}
    </GroupTotalRow>
  );
}

const COLUMN_DRAG = "text/x-database-column";

function HeaderCell({
  column: shown,
  width,
  onResize,
  onResizeEnd,
  onFitWidth,
}: {
  column: ComputedColumn;
  width: number;
  onResize: (width: number) => void;
  onResizeEnd: (width: number) => void;
  onFitWidth: () => void;
}) {
  const { schemaEditable: editable, data, mutator } = useDatabase();
  const [open, setOpen] = React.useState(false);
  const resizing = React.useRef(false);
  // The menu edits the stored column (a formula, not its result type).
  const column = shown.source ?? shown;
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
        if (resizing.current) {
          event.preventDefault();
          return;
        }
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
      <Resizer
        aria-hidden
        onDoubleClick={onFitWidth}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          resizing.current = true;
          const handle = event.currentTarget;
          const startX = event.clientX;
          let next = width;
          handle.setPointerCapture(event.pointerId);
          const move = (e: PointerEvent) => {
            next = width + e.clientX - startX;
            onResize(next);
          };
          const end = () => {
            handle.removeEventListener("pointermove", move);
            handle.removeEventListener("pointerup", end);
            handle.removeEventListener("pointercancel", end);
            resizing.current = false;
            onResizeEnd(next);
          };
          handle.addEventListener("pointermove", move);
          handle.addEventListener("pointerup", end);
          handle.addEventListener("pointercancel", end);
        }}
      />
    </HeaderTh>
  );
}

function formatTotal(
  kind: TotalKind,
  value: number | string | undefined,
  column: Column
) {
  if (value === undefined) {
    return "—";
  }
  if (kind === "earliest" || kind === "latest") {
    return formatDate(value);
  }
  const amount = ["sum", "avg", "min", "max"].includes(kind);
  const text =
    amount && column.numberFormat
      ? formatNumber(column, Number(value))
      : Number(value).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  return kind === "percent_not_empty" || kind === "percent_checked"
    ? `${text}%`
    : text;
}

/** Total under a column, calculated over the rows shown in the view. */
function TotalCell({
  column,
  values,
}: {
  column: Column;
  values: (CellValue | undefined)[];
}) {
  const { t } = useTranslation();
  const { view, editable } = useDatabase();
  const updateView = useUpdateView();
  const labels = useTotalLabels();
  const [open, setOpen] = React.useState(false);
  const offered = totalsFor(column.type);
  const stored = view.totals?.[column.id];
  // A total that no longer fits the column type (after a type change) is
  // not shown.
  const kind = stored && offered.includes(stored) ? stored : undefined;
  const result = kind && (
    <>
      <TotalLabel>{labels[kind]}</TotalLabel>
      {formatTotal(kind, computeTotal(kind, values), column)}
    </>
  );

  if (!editable) {
    return (
      <td>
        <TotalButton as="div">{result}</TotalButton>
      </td>
    );
  }

  const choose = (next?: TotalKind) => {
    const totals = { ...view.totals };
    if (next) {
      totals[column.id] = next;
    } else {
      delete totals[column.id];
    }
    updateView({ totals });
    setOpen(false);
  };

  return (
    <td>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger>
          <TotalButton type="button" $empty={!kind}>
            {result || t("Calculate")}
          </TotalButton>
        </PopoverTrigger>
        <PopoverContent width={200} shrink align="end" onClick={stop}>
          <PopoverBody>
            <MenuRow type="button" $active={!kind} onClick={() => choose()}>
              {t("None")}
            </MenuRow>
            {offered.map((option) => (
              <MenuRow
                key={option}
                type="button"
                $active={option === kind}
                onClick={() => choose(option)}
              >
                {labels[option]}
              </MenuRow>
            ))}
          </PopoverBody>
        </PopoverContent>
      </Popover>
    </td>
  );
}

const ROW_DRAG = "text/x-database-row-order";

function TableRow({
  row,
  depth = 0,
  childCount = 0,
  folded,
  onToggle,
  subColumnId,
  columns,
  autoFocus,
  reorderable,
  drop,
  onDragOverRow,
  onDropRow,
  onDragEnd,
}: {
  row: ComputedRow;
  /** Level of a sub-item in the tree, 0 for top rows. */
  depth?: number;
  childCount?: number;
  folded?: boolean;
  onToggle?: () => void;
  /** Sub-items relation, when the database has sub-items. */
  subColumnId?: string;
  columns: ComputedColumn[];
  autoFocus?: boolean;
  reorderable: boolean;
  drop: "before" | "after" | null;
  onDragOverRow: (after: boolean) => void;
  onDropRow: (rowId: string, after: boolean) => void;
  onDragEnd: () => void;
}) {
  const { t } = useTranslation();
  const {
    data,
    editable,
    schemaEditable,
    mutator,
    createOption,
    openRow,
    userName,
    addRow,
  } = useDatabase();
  const [menuOpen, setMenuOpen] = React.useState(false);

  // A template keeps the stored values of the row (not calculated ones) and
  // its page, which is copied for rows created from the template.
  const saveAsTemplate = () => {
    const stored = data.rows.find((r) => r.id === row.id);
    if (!stored) {
      return;
    }
    const cells = Object.fromEntries(
      data.columns
        .filter(
          (c) =>
            !calculatedTypes.includes(c.type) &&
            c.type !== ColumnType.AutoNumber &&
            !isEmptyValue(stored.cells[c.id])
        )
        .map((c) => [c.id, stored.cells[c.id]])
    );
    const titleColumn = data.columns[0];
    const name =
      (titleColumn &&
        displayValue(titleColumn, stored.cells[titleColumn.id], userName)) ||
      t("Template");
    mutator.setAttrs({
      templates: [
        ...(data.templates ?? []),
        {
          id: newId(),
          name,
          cells,
          ...(stored.docId ? { pageId: stored.docId } : {}),
        },
      ],
    });
  };
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
                {schemaEditable && (
                  <MenuRow
                    type="button"
                    onClick={() => {
                      saveAsTemplate();
                      setMenuOpen(false);
                    }}
                  >
                    <NewDocumentIcon size={18} />
                    {t("Save as template")}
                  </MenuRow>
                )}
                {subColumnId && (
                  <MenuRow
                    type="button"
                    onClick={() => {
                      addRow({ [subColumnId]: [row.id] });
                      setMenuOpen(false);
                    }}
                  >
                    <PlusIcon size={18} />
                    {t("Add sub-item")}
                  </MenuRow>
                )}
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
          {index === 0 && (depth > 0 || childCount > 0) ? (
            <TreeCell style={{ paddingLeft: depth * 18 }}>
              {childCount > 0 ? (
                <Fold
                  type="button"
                  aria-label={t("Sub-items")}
                  onClick={onToggle}
                >
                  {folded ? "▸" : "▾"}
                </Fold>
              ) : (
                <FoldSpace />
              )}
              <Cell
                column={column}
                value={row.cells[column.id]}
                links={row.links?.[column.id]}
                editable={editable && !isComputed(column)}
                onChange={(value) =>
                  mutator.setCells(row.id, { [column.id]: value })
                }
                onCreateOption={(name) => createOption(column, name)}
              />
            </TreeCell>
          ) : row.errors?.[column.id] ? (
            <CellError>{row.errors[column.id]}</CellError>
          ) : (
            <Cell
              column={column}
              value={row.cells[column.id]}
              links={row.links?.[column.id]}
              editable={editable && !isComputed(column)}
              autoFocus={autoFocus && index === 0 && !isComputed(column)}
              onChange={(value) =>
                mutator.setCells(row.id, { [column.id]: value })
              }
              onCreateOption={(name) => createOption(column, name)}
            />
          )}
        </td>
      ))}
      {editable && <td />}
    </DropRow>
  );
}

// Tall tables scroll inside the box, so the header and the horizontal
// scrollbar stay in view.
const Scroll = styled.div`
  max-height: 75vh;
  overflow: auto;
  margin: 0 0 4px;
`;

// Separate borders: collapsed borders do not stay with sticky cells.
const Table = styled.table`
  width: max-content;
  min-width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;

  th,
  td {
    border: 0;
    border-right: 1px solid ${s("divider")};
    border-bottom: 1px solid ${s("divider")};
    padding: 0;
    vertical-align: top;
    background: none;
  }

  th:first-child,
  td:first-child,
  th:last-child,
  td:last-child {
    border-right: 0;
  }

  thead th {
    position: sticky;
    top: 0;
    z-index: 2;
    font-weight: 500;
    background: ${s("background")};
  }

  /* The row handle and the first column stay when scrolling sideways. */
  th:nth-child(1),
  td:nth-child(1),
  th:nth-child(2),
  td:nth-child(2) {
    position: sticky;
    z-index: 1;
    background: ${s("background")};
  }

  th:nth-child(1),
  td:nth-child(1) {
    left: 0;
  }

  th:nth-child(2),
  td:nth-child(2) {
    left: 32px;
  }

  thead th:nth-child(1),
  thead th:nth-child(2) {
    z-index: 3;
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

// Handle on the right edge of a header that changes the column width.
const Resizer = styled.div`
  position: absolute;
  top: 0;
  right: -4px;
  z-index: 1;
  width: 7px;
  height: 100%;
  cursor: col-resize;
  touch-action: none;

  &:hover,
  &:active {
    background: linear-gradient(
      to right,
      transparent 2px,
      ${s("accent")} 2px,
      ${s("accent")} 5px,
      transparent 5px
    );
  }
`;

const Footer = styled.tfoot`
  && td {
    border-bottom: 0;
  }

  &:hover button {
    opacity: 1;
  }
`;

const TotalButton = styled.button<{ $empty?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  width: 100%;
  height: 30px;
  padding: 0 8px;
  border: 0;
  background: none;
  color: ${s("text")};
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  cursor: pointer;
  opacity: ${(props) => (props.$empty ? 0 : 1)};

  ${(props) => props.$empty && `color: ${props.theme.textTertiary};`}

  &:focus-visible,
  &[data-state="open"] {
    opacity: 1;
  }
`;

const TreeCell = styled.div`
  display: flex;
  align-items: flex-start;

  > :last-child {
    flex: 1;
    min-width: 0;
  }
`;

const Fold = styled.button`
  flex-shrink: 0;
  width: 18px;
  height: 34px;
  padding: 0;
  border: 0;
  background: none;
  color: ${s("textTertiary")};
  cursor: pointer;
`;

const FoldSpace = styled.span`
  flex-shrink: 0;
  width: 18px;
`;

const GroupCell = styled.td`
  && {
    background: ${s("backgroundSecondary")};
  }
`;

const GroupHeader = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 8px;
  border: 0;
  background: none;
  color: ${s("text")};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
`;

const GroupCount = styled.span`
  color: ${s("textTertiary")};
  font-weight: 400;
`;

const GroupTotalRow = styled.tr`
  td {
    border-bottom-width: 2px;
  }
`;

const TotalLabel = styled.span`
  color: ${s("textTertiary")};
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
