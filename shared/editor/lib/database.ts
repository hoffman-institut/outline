import { v4 as uuidv4 } from "uuid";

/**
 * Data model and pure helpers for the "database" block: typed columns, rows
 * and views (sort, filters, grouping) stored inside a document. Shared by the
 * client UI, the server (markdown, plain text) and tests.
 */

export enum ColumnType {
  Text = "text",
  Number = "number",
  Select = "select",
  MultiSelect = "multi_select",
  Date = "date",
  Person = "person",
  Checkbox = "checkbox",
  Url = "url",
  Email = "email",
  Phone = "phone",
  Formula = "formula",
  Relation = "relation",
  Backlink = "backlink",
  Rollup = "rollup",
  AutoNumber = "auto_number",
}

/** How numbers are shown: as typed, with thousands separators, as money. */
export type NumberFormat =
  | "plain"
  | "grouped"
  | "ruble"
  | "dollar"
  | "euro"
  | "percent";

export const numberFormats: NumberFormat[] = [
  "plain",
  "grouped",
  "ruble",
  "dollar",
  "euro",
  "percent",
];

export enum ViewType {
  Table = "table",
  Board = "board",
  Calendar = "calendar",
}

export type OptionColor =
  | "gray"
  | "brown"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "pink"
  | "red"
  | "cyan";

export type SelectOption = {
  id: string;
  name: string;
  color: OptionColor;
};

export type Column = {
  id: string;
  name: string;
  type: ColumnType;
  /** Choices for select and multi-select columns. */
  options?: SelectOption[];
  /** Column width in pixels in the table view. */
  width?: number;
  /** Formula columns: the formula, e.g. "[Цена] * [Количество]". */
  formula?: string;
  /**
   * Relation columns: the linked database. Backlink columns: the database
   * whose relation column (columnId) links to this one.
   */
  relation?: DatabaseRef;
  /** Rollup columns: what to calculate over the linked rows. */
  rollup?: Rollup;
  /** Number columns (and formulas, rollups with numbers): display format. */
  numberFormat?: NumberFormat;
  /** Number columns: show a progress bar from 0 to `max` (100 by default). */
  showAs?: "bar";
  max?: number;
  /** Auto number columns: text before the number, e.g. "TASK-". */
  prefix?: string;
};

/** A database block in a document. */
export type DatabaseRef = {
  documentId: string;
  databaseId: string;
  /** Backlinks: the relation column of the other database. */
  columnId?: string;
};

export type RollupFunction = TotalKind | "values";

export type Rollup = {
  /** Relation or backlink column of this database. */
  columnId: string;
  /** Column of the linked database. */
  targetColumnId: string;
  fn: RollupFunction;
};

export type SortDirection = "asc" | "desc";

export type SortRule = {
  columnId: string;
  direction: SortDirection;
  /** For date columns: order by the next anniversary, ignoring the year. */
  upcoming?: boolean;
};

export type FilterOperator =
  | "contains"
  | "not_contains"
  | "is"
  | "is_not"
  | "is_empty"
  | "is_not_empty"
  | "gt"
  | "lt"
  | "before"
  | "after"
  | "next_days"
  | "today"
  | "this_week"
  | "this_month"
  | "last_days"
  | "within_days"
  | "checked"
  | "unchecked";

export type FilterRule = {
  columnId: string;
  operator: FilterOperator;
  value?: string | number;
};

export type View = {
  id: string;
  name: string;
  type: ViewType;
  sort: SortRule[];
  filters: FilterRule[];
  /** Columns hidden in this view. */
  hidden: string[];
  /** Board view: the select column whose options become board columns. */
  groupBy?: string;
  /** Calendar view: the date column that places rows on days. */
  dateColumn?: string;
  /** Calendar view: repeat dates every year (birthdays, anniversaries). */
  recurring?: boolean;
  /** Table view: the total shown under each column, by column id. */
  totals?: Record<string, TotalKind>;
  /** New rows go to the top instead of the bottom. */
  newRowsFirst?: boolean;
};

export type TotalKind =
  | "count"
  | "not_empty"
  | "empty"
  | "percent_not_empty"
  | "unique"
  | "sum"
  | "avg"
  | "min"
  | "max"
  | "earliest"
  | "latest"
  | "checked"
  | "unchecked"
  | "percent_checked";

export type CellValue = string | number | boolean | string[] | null;

export type Row = {
  id: string;
  cells: Record<string, CellValue>;
  /** Document that holds the row page, if one was created. */
  docId?: string | null;
};

export type DatabaseData = {
  title: string;
  columns: Column[];
  views: View[];
  rows: Row[];
};

export const optionColors: OptionColor[] = [
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
  "cyan",
];

/** Background and text colors of option chips, light and dark theme. */
export const optionPalette: Record<
  OptionColor,
  { light: [string, string]; dark: [string, string] }
> = {
  gray: { light: ["#E9EBEE", "#4E5C6E"], dark: ["#3A3F47", "#D3D8DE"] },
  brown: { light: ["#EEE3DA", "#6B4A33"], dark: ["#4A3B30", "#E8D5C4"] },
  orange: { light: ["#FBE4D0", "#9A4A12"], dark: ["#5A3A20", "#F7C9A1"] },
  yellow: { light: ["#FAF0C8", "#7A5A00"], dark: ["#544818", "#F3E09A"] },
  green: { light: ["#DCF1E1", "#24693A"], dark: ["#244530", "#B5E3C2"] },
  blue: { light: ["#D9E7FA", "#1E4F94"], dark: ["#23395A", "#B8D2F7"] },
  purple: { light: ["#E8DFF7", "#5B2F9A"], dark: ["#3D2E5C", "#D6C4F4"] },
  pink: { light: ["#F8DDEB", "#93285E"], dark: ["#552B42", "#F3BED9"] },
  red: { light: ["#F9DCDA", "#9B2620"], dark: ["#5A2724", "#F4BDB8"] },
  cyan: { light: ["#D5F0F2", "#14636B"], dark: ["#1F4A4F", "#ABE3E8"] },
};

export const newId = () => uuidv4();

/** Column types whose value is free text. */
export const textLikeTypes = [
  ColumnType.Text,
  ColumnType.Url,
  ColumnType.Email,
  ColumnType.Phone,
];

/**
 * Picks the next option color so that new options are distinguishable.
 *
 * @param options existing options.
 * @returns a color not used yet, or a repeating one.
 */
export function nextOptionColor(options: SelectOption[] = []): OptionColor {
  const used = new Set(options.map((o) => o.color));
  return (
    optionColors.find((c) => !used.has(c) && c !== "gray") ??
    optionColors[options.length % optionColors.length]
  );
}

/**
 * A new database with a title column, a tags column, a date column, three
 * empty rows and a table view.
 *
 * @param names localized default names.
 * @returns database data.
 */
export function createDefaultDatabase(names: {
  title: string;
  name: string;
  tags: string;
  date: string;
  view: string;
}): DatabaseData {
  const titleColumn: Column = {
    id: newId(),
    name: names.name,
    type: ColumnType.Text,
  };
  const columns: Column[] = [
    titleColumn,
    {
      id: newId(),
      name: names.tags,
      type: ColumnType.MultiSelect,
      options: [],
    },
    { id: newId(), name: names.date, type: ColumnType.Date },
  ];
  return {
    title: names.title,
    columns,
    views: [createView(ViewType.Table, names.view)],
    rows: [0, 1, 2].map(() => ({ id: newId(), cells: {} })),
  };
}

export function createView(type: ViewType, name: string): View {
  return { id: newId(), name, type, sort: [], filters: [], hidden: [] };
}

export function isEmptyValue(value: CellValue | undefined): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    value === false ||
    (Array.isArray(value) && value.length === 0)
  );
}

/**
 * Reads "YYYY-MM-DD" into its parts, or undefined for anything else.
 *
 * @param value stored date value.
 * @returns year, month (1-12) and day.
 */
export function parseDateValue(
  value: CellValue | undefined
): { year: number; month: number; day: number } | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return undefined;
  }
  return { year: +match[1], month: +match[2], day: +match[3] };
}

/** Formats a stored date as DD.MM.YYYY. */
export function formatDate(value: CellValue | undefined): string {
  const date = parseDateValue(value);
  if (!date) {
    return "";
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.day)}.${pad(date.month)}.${date.year}`;
}

/** Today as "YYYY-MM-DD" in local time. */
export function todayValue(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const isLeapYear = (year: number) =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/**
 * Days from today until the next anniversary of a date (0 = today). A 29
 * February date falls on 28 February in common years.
 *
 * @param value stored date value.
 * @param today today as "YYYY-MM-DD".
 * @returns days until the next anniversary, or undefined for empty values.
 */
export function daysUntilAnniversary(
  value: CellValue | undefined,
  today = todayValue()
): number | undefined {
  const date = parseDateValue(value);
  const now = parseDateValue(today);
  if (!date || !now) {
    return undefined;
  }
  const dayInYear = (year: number) =>
    date.month === 2 && date.day === 29 && !isLeapYear(year) ? 28 : date.day;
  const start = Date.UTC(now.year, now.month - 1, now.day);
  let next = Date.UTC(now.year, date.month - 1, dayInYear(now.year));
  if (next < start) {
    next = Date.UTC(now.year + 1, date.month - 1, dayInYear(now.year + 1));
  }
  return Math.round((next - start) / 86400000);
}

/**
 * Formats a number for display.
 *
 * @param column the column with its number format.
 * @param n the number.
 * @returns the text, e.g. "1 250 000 ₽".
 */
export function formatNumber(
  column: Pick<Column, "numberFormat">,
  n: number
): string {
  const grouped = (digits: number) =>
    n.toLocaleString("ru-RU", { maximumFractionDigits: digits });
  switch (column.numberFormat) {
    case "grouped":
      return grouped(10);
    case "ruble":
      return `${grouped(2)} ₽`;
    case "dollar":
      return `${grouped(2)} $`;
    case "euro":
      return `${grouped(2)} €`;
    case "percent":
      return `${grouped(10)} %`;
    default:
      return String(n);
  }
}

/**
 * Human readable value of a cell, used for plain text, search and sorting of
 * select options.
 *
 * @param column the column definition.
 * @param value the stored value.
 * @param userName optional resolver of user ids to names.
 * @returns the display text.
 */
export function displayValue(
  column: Column,
  value: CellValue | undefined,
  userName?: (id: string) => string | undefined
): string {
  if (isEmptyValue(value) && column.type !== ColumnType.Checkbox) {
    return "";
  }
  switch (column.type) {
    case ColumnType.Select: {
      const option = column.options?.find((o) => o.id === value);
      return option?.name ?? "";
    }
    case ColumnType.MultiSelect: {
      const ids = Array.isArray(value) ? value : [];
      return ids
        .map((id) => column.options?.find((o) => o.id === id)?.name)
        .filter(Boolean)
        .join(", ");
    }
    case ColumnType.Date:
      return formatDate(value);
    case ColumnType.Checkbox:
      return value ? "✓" : "";
    case ColumnType.Person: {
      const ids = Array.isArray(value) ? value : [];
      return ids.map((id) => userName?.(id) ?? id).join(", ");
    }
    case ColumnType.Relation:
    case ColumnType.Backlink:
      // Row ids; the titles live in the linked database.
      return "";
    case ColumnType.Number:
      return typeof value === "number"
        ? formatNumber(column, value)
        : String(value ?? "");
    case ColumnType.AutoNumber:
      return `${column.prefix ?? ""}${value}`;
    default:
      return String(value ?? "");
  }
}

/**
 * Converts a value when a column changes type, keeping as much as possible.
 *
 * @param from the old column.
 * @param to the new column (options may be extended by the caller).
 * @param value the stored value.
 * @returns the value for the new type.
 */
export function convertValue(
  from: Column,
  to: Column,
  value: CellValue | undefined
): CellValue {
  if (isEmptyValue(value)) {
    return to.type === ColumnType.Checkbox ? false : null;
  }
  const text = displayValue(from, value);
  switch (to.type) {
    case ColumnType.Number: {
      if (typeof value === "number") {
        return value;
      }
      const n = parseFloat(text.replace(/\s/g, "").replace(",", "."));
      return Number.isFinite(n) ? n : null;
    }
    case ColumnType.Checkbox:
      return ["✓", "true", "1", "да", "yes"].includes(text.toLowerCase());
    case ColumnType.Date: {
      const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
      const ru = text.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
      return iso
        ? `${iso[1]}-${iso[2]}-${iso[3]}`
        : ru
          ? `${ru[3]}-${ru[2]}-${ru[1]}`
          : null;
    }
    case ColumnType.Select: {
      const first = text.split(",")[0]?.trim();
      return to.options?.find((o) => o.name === first)?.id ?? null;
    }
    case ColumnType.MultiSelect:
      return text
        .split(",")
        .map((part) => to.options?.find((o) => o.name === part.trim())?.id)
        .filter((id): id is string => !!id);
    case ColumnType.Person:
      return Array.isArray(value) && from.type === ColumnType.Person
        ? value
        : [];
    case ColumnType.Relation:
      return Array.isArray(value) && from.type === ColumnType.Relation
        ? value
        : [];
    default:
      return text;
  }
}

/**
 * Moves a column next to another one.
 *
 * @param columns all columns in their current order.
 * @param columnId the column to move.
 * @param targetId the column to place it next to.
 * @param after place it after the target instead of before.
 * @returns the reordered columns, or the same array if nothing moves.
 */
export function moveColumn(
  columns: Column[],
  columnId: string,
  targetId: string,
  after: boolean
): Column[] {
  const moving = columns.find((c) => c.id === columnId);
  if (!moving || columnId === targetId) {
    return columns;
  }
  const rest = columns.filter((c) => c.id !== columnId);
  const index = rest.findIndex((c) => c.id === targetId);
  if (index < 0) {
    return columns;
  }
  rest.splice(after ? index + 1 : index, 0, moving);
  return rest;
}

/**
 * Index for DatabaseMutator.moveRow when a row is dropped next to another.
 * Rows hidden by a filter keep their places.
 *
 * @param rows all rows in document order.
 * @param rowId the dragged row.
 * @param targetId the row it was dropped on.
 * @param after drop below the target instead of above.
 * @returns the index among the other rows, or -1 when nothing moves.
 */
export function rowDropIndex(
  rows: Row[],
  rowId: string,
  targetId: string,
  after: boolean
): number {
  if (rowId === targetId) {
    return -1;
  }
  const rest = rows.filter((r) => r.id !== rowId);
  const index = rest.findIndex((r) => r.id === targetId);
  if (index < 0 || rest.length === rows.length) {
    return -1;
  }
  return after ? index + 1 : index;
}

/**
 * Option names that a type change needs to create, e.g. when text becomes a
 * select column.
 */
export function optionNamesFor(from: Column, rows: Row[]): string[] {
  const names = new Set<string>();
  for (const row of rows) {
    const text = displayValue(from, row.cells[from.id]);
    text
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((name) => names.add(name));
  }
  return [...names];
}

function compareCells(
  column: Column,
  a: CellValue | undefined,
  b: CellValue | undefined,
  rule: SortRule,
  today: string
): number {
  const emptyA = isEmptyValue(a);
  const emptyB = isEmptyValue(b);
  if (column.type !== ColumnType.Checkbox && (emptyA || emptyB)) {
    // Empty values always go last, whatever the direction.
    return emptyA === emptyB ? 0 : emptyA ? 1 : -1;
  }
  let result: number;
  switch (column.type) {
    case ColumnType.Number:
    case ColumnType.AutoNumber:
      result = Number(a) - Number(b);
      break;
    case ColumnType.Checkbox:
      result = Number(!!a) - Number(!!b);
      break;
    case ColumnType.Date:
      result = rule.upcoming
        ? (daysUntilAnniversary(a, today) ?? 0) -
          (daysUntilAnniversary(b, today) ?? 0)
        : String(a).localeCompare(String(b));
      break;
    case ColumnType.Select: {
      // Order of options, as the user arranged them.
      const index = (v: CellValue | undefined) =>
        column.options?.findIndex((o) => o.id === v) ?? -1;
      result = index(a) - index(b);
      break;
    }
    default:
      result = displayValue(column, a).localeCompare(
        displayValue(column, b),
        "ru",
        { numeric: true, sensitivity: "base" }
      );
  }
  return rule.direction === "desc" ? -result : result;
}

/**
 * Whether a row passes a filter rule.
 */
export function matchesFilter(
  column: Column,
  value: CellValue | undefined,
  filter: FilterRule,
  today = todayValue()
): boolean {
  const empty = isEmptyValue(value);
  if (
    column.type === ColumnType.Date &&
    relativeDateOperators.includes(filter.operator)
  ) {
    return matchesRelativeDate(value, filter, today);
  }
  switch (filter.operator) {
    case "is_empty":
      return empty;
    case "is_not_empty":
      return !empty;
    case "checked":
      return !!value;
    case "unchecked":
      return !value;
    default:
      break;
  }
  if (filter.value === undefined || filter.value === "") {
    // An unfinished filter does not hide anything.
    return true;
  }
  const needle = String(filter.value);
  switch (column.type) {
    case ColumnType.Relation:
    case ColumnType.Backlink: {
      const ids = Array.isArray(value) ? value : [];
      return filter.operator === "not_contains"
        ? !ids.includes(needle)
        : ids.includes(needle);
    }
    case ColumnType.Number:
    case ColumnType.AutoNumber: {
      const n = Number(value);
      const target = Number(filter.value);
      if (empty) {
        return filter.operator === "is_not";
      }
      return filter.operator === "gt"
        ? n > target
        : filter.operator === "lt"
          ? n < target
          : filter.operator === "is_not"
            ? n !== target
            : n === target;
    }
    case ColumnType.Select:
      return filter.operator === "is_not" ? value !== needle : value === needle;
    case ColumnType.MultiSelect:
    case ColumnType.Person: {
      const ids = Array.isArray(value) ? value : [];
      return filter.operator === "not_contains"
        ? !ids.includes(needle)
        : ids.includes(needle);
    }
    case ColumnType.Date: {
      if (empty) {
        return false;
      }
      if (filter.operator === "next_days") {
        const days = daysUntilAnniversary(value, today);
        return days !== undefined && days <= Number(filter.value);
      }
      const v = String(value);
      return filter.operator === "before"
        ? v < needle
        : filter.operator === "after"
          ? v > needle
          : v.startsWith(needle);
    }
    default: {
      const text = displayValue(column, value).toLowerCase();
      const target = needle.toLowerCase();
      return filter.operator === "is"
        ? text === target
        : filter.operator === "is_not"
          ? text !== target
          : filter.operator === "not_contains"
            ? !text.includes(target)
            : text.includes(target);
    }
  }
}

const relativeDateOperators: FilterOperator[] = [
  "today",
  "this_week",
  "this_month",
  "last_days",
  "within_days",
];

const dayNumber = (value: string) =>
  Math.round(
    Date.UTC(+value.slice(0, 4), +value.slice(5, 7) - 1, +value.slice(8, 10)) /
      86400000
  );

/** Monday of the week of a day number (1970-01-01 was a Thursday). */
const weekStart = (day: number) => day - ((day + 3) % 7);

function matchesRelativeDate(
  value: CellValue | undefined,
  filter: FilterRule,
  today: string
): boolean {
  const days = Number(filter.value);
  const needsDays =
    filter.operator === "last_days" || filter.operator === "within_days";
  if (needsDays && (filter.value === undefined || filter.value === "")) {
    // An unfinished filter does not hide anything.
    return true;
  }
  if (!parseDateValue(value)) {
    return false;
  }
  const day = dayNumber(String(value));
  const now = dayNumber(today);
  switch (filter.operator) {
    case "today":
      return day === now;
    case "this_week":
      return weekStart(day) === weekStart(now);
    case "this_month":
      return String(value).slice(0, 7) === today.slice(0, 7);
    case "last_days":
      return day <= now && day >= now - days;
    case "within_days":
      return day >= now && day <= now + days;
    default:
      return true;
  }
}

/**
 * Cells for a row added to a filtered view, so that the new row matches the
 * filters and stays visible.
 *
 * @param columns the columns of the database.
 * @param filters the filters of the view.
 * @returns initial cell values.
 */
export function cellsForFilters(
  columns: Column[],
  filters: FilterRule[]
): Record<string, CellValue> {
  const cells: Record<string, CellValue> = {};
  for (const filter of filters) {
    const column = columns.find((c) => c.id === filter.columnId);
    const value = filter.value;
    if (!column) {
      continue;
    }
    if (filter.operator === "checked") {
      cells[column.id] = true;
      continue;
    }
    if (value === undefined || value === "") {
      continue;
    }
    switch (column.type) {
      case ColumnType.Select:
        if (filter.operator === "is") {
          cells[column.id] = String(value);
        }
        break;
      case ColumnType.MultiSelect:
      case ColumnType.Person:
      case ColumnType.Relation:
        if (filter.operator === "contains") {
          cells[column.id] = [String(value)];
        }
        break;
      case ColumnType.Number:
        if (filter.operator === "is") {
          cells[column.id] = Number(value);
        }
        break;
      case ColumnType.Date:
        if (filter.operator === "is") {
          cells[column.id] = String(value);
        }
        break;
      case ColumnType.Text:
      case ColumnType.Url:
      case ColumnType.Email:
      case ColumnType.Phone:
        if (filter.operator === "is" || filter.operator === "contains") {
          cells[column.id] = String(value);
        }
        break;
      default:
        break;
    }
  }
  return cells;
}

/**
 * Next number of an auto number column.
 *
 * @param rows all rows.
 * @param columnId the auto number column.
 * @returns the largest number plus one.
 */
export function nextAutoNumber(
  rows: Pick<Row, "cells">[],
  columnId: string
): number {
  return (
    rows.reduce((max, row) => {
      const n = row.cells[columnId];
      return typeof n === "number" && n > max ? n : max;
    }, 0) + 1
  );
}

/**
 * Rows of a view: filtered, then sorted. Without sort rules the document
 * order is kept (manual order).
 *
 * @param data the database.
 * @param view the view to apply.
 * @param today today as "YYYY-MM-DD".
 * @returns the rows to display.
 */
export function rowsForView<R extends Row>(
  data: { columns: Column[]; rows: R[] },
  view: View | undefined,
  today = todayValue()
): R[] {
  if (!view) {
    return data.rows;
  }
  const byId = new Map(data.columns.map((c) => [c.id, c]));
  const filtered = data.rows.filter((row) =>
    view.filters.every((filter) => {
      const column = byId.get(filter.columnId);
      return column
        ? matchesFilter(column, row.cells[column.id], filter, today)
        : true;
    })
  );
  const rules = view.sort.filter((rule) => byId.has(rule.columnId));
  if (!rules.length) {
    return filtered;
  }
  // Relations sort by the titles of the linked rows (calculated rows carry
  // them in `links`).
  const sortable = (
    column: Column,
    row: R
  ): [Column, CellValue | undefined] => {
    if (
      column.type === ColumnType.Relation ||
      column.type === ColumnType.Backlink
    ) {
      const links = (row as { links?: Record<string, { title: string }[]> })
        .links?.[column.id];
      return [
        { ...column, type: ColumnType.Text },
        (links ?? []).map((link) => link.title).join(", "),
      ];
    }
    return [column, row.cells[column.id]];
  };
  return filtered
    .map((row, index) => ({ row, index }))
    .sort((x, y) => {
      for (const rule of rules) {
        const [column, a] = sortable(byId.get(rule.columnId)!, x.row);
        const [, b] = sortable(byId.get(rule.columnId)!, y.row);
        const result = compareCells(column, a, b, rule, today);
        if (result !== 0) {
          return result;
        }
      }
      return x.index - y.index;
    })
    .map(({ row }) => row);
}

/** Filter operators offered for a column type. */
export function operatorsFor(type: ColumnType): FilterOperator[] {
  switch (type) {
    case ColumnType.Number:
    case ColumnType.AutoNumber:
      return ["is", "is_not", "gt", "lt", "is_empty", "is_not_empty"];
    case ColumnType.Select:
      return ["is", "is_not", "is_empty", "is_not_empty"];
    case ColumnType.MultiSelect:
    case ColumnType.Person:
      return ["contains", "not_contains", "is_empty", "is_not_empty"];
    case ColumnType.Date:
      return [
        "is",
        "before",
        "after",
        "today",
        "this_week",
        "this_month",
        "last_days",
        "within_days",
        "next_days",
        "is_empty",
        "is_not_empty",
      ];
    case ColumnType.Checkbox:
      return ["checked", "unchecked"];
    case ColumnType.Relation:
    case ColumnType.Backlink:
      return ["contains", "not_contains", "is_empty", "is_not_empty"];
    default:
      return [
        "contains",
        "not_contains",
        "is",
        "is_not",
        "is_empty",
        "is_not_empty",
      ];
  }
}

/** Totals offered under a column of the given type. */
export function totalsFor(type: ColumnType): TotalKind[] {
  switch (type) {
    case ColumnType.Number:
      return ["count", "not_empty", "empty", "sum", "avg", "min", "max"];
    case ColumnType.Date:
      return ["count", "not_empty", "empty", "earliest", "latest"];
    case ColumnType.Checkbox:
      return ["count", "checked", "unchecked", "percent_checked"];
    default:
      return ["count", "not_empty", "empty", "percent_not_empty", "unique"];
  }
}

const allTotals: TotalKind[] = [
  "count",
  "not_empty",
  "empty",
  "percent_not_empty",
  "unique",
  "sum",
  "avg",
  "min",
  "max",
  "earliest",
  "latest",
  "checked",
  "unchecked",
  "percent_checked",
];

/**
 * Calculates a column total over the rows of a view.
 *
 * @param kind what to calculate.
 * @param values the column values of the rows.
 * @returns a number (percents are 0-100), a date as "YYYY-MM-DD", or
 * undefined when there is nothing to calculate.
 */
export function computeTotal(
  kind: TotalKind,
  values: (CellValue | undefined)[]
): number | string | undefined {
  const filled = values.filter((v) => !isEmptyValue(v));
  const percent = (part: number) =>
    values.length ? Math.round((part / values.length) * 100) : undefined;
  const numbers = filled
    .map((v) => (typeof v === "number" ? v : parseFloat(String(v))))
    .filter((n) => Number.isFinite(n));
  const dates = filled
    .filter((v) => parseDateValue(v))
    .map((v) => String(v).slice(0, 10))
    .sort();
  switch (kind) {
    case "count":
      return values.length;
    case "not_empty":
      return filled.length;
    case "empty":
      return values.length - filled.length;
    case "percent_not_empty":
      return percent(filled.length);
    case "unique": {
      const seen = new Set<string>();
      for (const value of filled) {
        (Array.isArray(value) ? value : [String(value)]).forEach((v) =>
          seen.add(v)
        );
      }
      return seen.size;
    }
    case "sum":
      return numbers.reduce((a, b) => a + b, 0);
    case "avg":
      return numbers.length
        ? numbers.reduce((a, b) => a + b, 0) / numbers.length
        : undefined;
    case "min":
      return numbers.length ? Math.min(...numbers) : undefined;
    case "max":
      return numbers.length ? Math.max(...numbers) : undefined;
    case "earliest":
      return dates[0];
    case "latest":
      return dates[dates.length - 1];
    case "checked":
      return values.filter((v) => !!v).length;
    case "unchecked":
      return values.filter((v) => !v).length;
    case "percent_checked":
      return percent(values.filter((v) => !!v).length);
    default:
      return undefined;
  }
}

/**
 * Plain text of a database for search and previews: title, column names and
 * every row as "value · value".
 */
export function databaseToPlainText(
  data: DatabaseData,
  userName?: (id: string) => string | undefined
): string {
  const lines = [data.title, data.columns.map((c) => c.name).join(" · ")];
  for (const row of data.rows) {
    lines.push(
      data.columns
        .map((c) => displayValue(c, row.cells[c.id], userName))
        .filter(Boolean)
        .join(" · ")
    );
  }
  return lines.filter(Boolean).join("\n");
}

/**
 * Normalizes data parsed from markdown or HTML so that missing fields get
 * defaults and unknown shapes cannot break the editor.
 */
export function normalizeDatabase(input: unknown): DatabaseData {
  const raw = (input ?? {}) as Partial<DatabaseData>;
  const columns: Column[] = Array.isArray(raw.columns)
    ? raw.columns
        .filter((c) => c && typeof c.id === "string")
        .map((c) => ({
          id: c.id,
          name: String(c.name ?? ""),
          type: Object.values(ColumnType).includes(c.type)
            ? c.type
            : ColumnType.Text,
          ...(Array.isArray(c.options)
            ? {
                options: c.options.map((o) => ({
                  id: String(o.id),
                  name: String(o.name ?? ""),
                  color: optionColors.includes(o.color) ? o.color : "gray",
                })),
              }
            : {}),
          ...(typeof c.width === "number" ? { width: c.width } : {}),
          ...(typeof c.formula === "string" ? { formula: c.formula } : {}),
          ...(c.relation &&
          typeof c.relation.documentId === "string" &&
          typeof c.relation.databaseId === "string"
            ? {
                relation: {
                  documentId: c.relation.documentId,
                  databaseId: c.relation.databaseId,
                  ...(typeof c.relation.columnId === "string"
                    ? { columnId: c.relation.columnId }
                    : {}),
                },
              }
            : {}),
          ...(numberFormats.includes(c.numberFormat as NumberFormat)
            ? { numberFormat: c.numberFormat }
            : {}),
          ...(c.showAs === "bar" ? { showAs: "bar" as const } : {}),
          ...(typeof c.max === "number" && c.max > 0 ? { max: c.max } : {}),
          ...(typeof c.prefix === "string" ? { prefix: c.prefix } : {}),
          ...(c.rollup &&
          typeof c.rollup.columnId === "string" &&
          typeof c.rollup.targetColumnId === "string" &&
          (c.rollup.fn === "values" || allTotals.includes(c.rollup.fn))
            ? {
                rollup: {
                  columnId: c.rollup.columnId,
                  targetColumnId: c.rollup.targetColumnId,
                  fn: c.rollup.fn,
                },
              }
            : {}),
        }))
    : [];
  const views: View[] = Array.isArray(raw.views)
    ? raw.views
        .filter((v) => v && typeof v.id === "string")
        .map((v) => ({
          id: v.id,
          name: String(v.name ?? ""),
          type: Object.values(ViewType).includes(v.type)
            ? v.type
            : ViewType.Table,
          sort: Array.isArray(v.sort) ? v.sort : [],
          filters: Array.isArray(v.filters) ? v.filters : [],
          hidden: Array.isArray(v.hidden) ? v.hidden : [],
          ...(v.groupBy ? { groupBy: v.groupBy } : {}),
          ...(v.dateColumn ? { dateColumn: v.dateColumn } : {}),
          ...(v.recurring ? { recurring: true } : {}),
          ...(v.totals && typeof v.totals === "object"
            ? {
                totals: Object.fromEntries(
                  Object.entries(v.totals).filter(([, kind]) =>
                    allTotals.includes(kind)
                  )
                ),
              }
            : {}),
          ...(v.newRowsFirst ? { newRowsFirst: true } : {}),
        }))
    : [];
  const rows: Row[] = Array.isArray(raw.rows)
    ? raw.rows
        .filter((r) => r && typeof r.id === "string")
        .map((r) => ({
          id: r.id,
          cells: r.cells && typeof r.cells === "object" ? r.cells : {},
          ...(r.docId ? { docId: r.docId } : {}),
        }))
    : [];
  return {
    title: String(raw.title ?? ""),
    columns,
    views: views.length ? views : [createView(ViewType.Table, "Table")],
    rows,
  };
}
