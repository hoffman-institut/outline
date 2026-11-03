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
}

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
};

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
    { id: newId(), name: names.tags, type: ColumnType.MultiSelect, options: [] },
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
    case ColumnType.Number:
      return typeof value === "number" ? String(value) : String(value ?? "");
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
      const n = parseFloat(text.replace(",", "."));
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
    default:
      return text;
  }
}

/**
 * Option names that a type change needs to create, e.g. when text becomes a
 * select column.
 */
export function optionNamesFor(
  from: Column,
  rows: Row[]
): string[] {
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
    case ColumnType.Number: {
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
      return filter.operator === "is_not"
        ? value !== needle
        : value === needle;
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

/**
 * Rows of a view: filtered, then sorted. Without sort rules the document
 * order is kept (manual order).
 *
 * @param data the database.
 * @param view the view to apply.
 * @param today today as "YYYY-MM-DD".
 * @returns the rows to display.
 */
export function rowsForView(
  data: Pick<DatabaseData, "columns" | "rows">,
  view: View | undefined,
  today = todayValue()
): Row[] {
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
  return filtered
    .map((row, index) => ({ row, index }))
    .sort((x, y) => {
      for (const rule of rules) {
        const column = byId.get(rule.columnId)!;
        const result = compareCells(
          column,
          x.row.cells[column.id],
          y.row.cells[column.id],
          rule,
          today
        );
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
      return ["is", "is_not", "gt", "lt", "is_empty", "is_not_empty"];
    case ColumnType.Select:
      return ["is", "is_not", "is_empty", "is_not_empty"];
    case ColumnType.MultiSelect:
    case ColumnType.Person:
      return ["contains", "not_contains", "is_empty", "is_not_empty"];
    case ColumnType.Date:
      return ["is", "before", "after", "next_days", "is_empty", "is_not_empty"];
    case ColumnType.Checkbox:
      return ["checked", "unchecked"];
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
        }))
    : [];
  const views: View[] = Array.isArray(raw.views)
    ? raw.views
        .filter((v) => v && typeof v.id === "string")
        .map((v) => ({
          id: v.id,
          name: String(v.name ?? ""),
          type: Object.values(ViewType).includes(v.type) ? v.type : ViewType.Table,
          sort: Array.isArray(v.sort) ? v.sort : [],
          filters: Array.isArray(v.filters) ? v.filters : [],
          hidden: Array.isArray(v.hidden) ? v.hidden : [],
          ...(v.groupBy ? { groupBy: v.groupBy } : {}),
          ...(v.dateColumn ? { dateColumn: v.dateColumn } : {}),
          ...(v.recurring ? { recurring: true } : {}),
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
