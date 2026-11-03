import type { CellValue, Column, DatabaseData, Row } from "./database";
import { ColumnType, displayValue, isEmptyValue, todayValue } from "./database";
import type { FormulaValue } from "./formula";
import {
  FormulaError,
  evaluateFormula,
  formatFormulaNumber,
  formulaValue,
} from "./formula";

/** A row with calculated cells and the errors of failed calculations. */
export type ComputedRow = Row & { errors?: Record<string, string> };

/**
 * A column as the views see it: a formula column gets the type of its results
 * (number, date, checkbox or text), so sorting, filters and totals work on
 * the values. `source` keeps the stored column.
 */
export type ComputedColumn = Column & { source?: Column };

/**
 * Database with calculated values, for display only. Never save these
 * columns or cells: the document stores formulas, not their results.
 */
export type ComputedDatabase = {
  columns: ComputedColumn[];
  rows: ComputedRow[];
};

export const isComputed = (column: ComputedColumn) => !!column.source;

function cellToFormula(
  column: Column,
  value: CellValue | undefined,
  userName?: (id: string) => string | undefined
): FormulaValue {
  switch (column.type) {
    case ColumnType.Checkbox:
      return !!value;
    case ColumnType.MultiSelect:
      return (Array.isArray(value) ? value : [])
        .map((id) => column.options?.find((o) => o.id === id)?.name)
        .filter((name): name is string => !!name);
    case ColumnType.Person:
      return (Array.isArray(value) ? value : []).map(
        (id) => userName?.(id) ?? id
      );
    default:
      break;
  }
  if (isEmptyValue(value)) {
    return null;
  }
  switch (column.type) {
    case ColumnType.Number:
      return typeof value === "number" ? value : String(value);
    case ColumnType.Date:
      return formulaValue.parseDate(String(value)) ?? null;
    default:
      return displayValue(column, value, userName);
  }
}

function formulaToCell(value: FormulaValue): {
  cell: CellValue;
  type?: ColumnType;
} {
  if (value === null || value === "") {
    return { cell: null };
  }
  if (typeof value === "number") {
    return { cell: value, type: ColumnType.Number };
  }
  if (typeof value === "boolean") {
    return { cell: value, type: ColumnType.Checkbox };
  }
  if (formulaValue.isDate(value)) {
    return { cell: value.date, type: ColumnType.Date };
  }
  const text = formulaValue.toText(value);
  return { cell: text || null, type: text ? ColumnType.Text : undefined };
}

/** Text of a calculated value, for columns whose rows return mixed types. */
function cellText(value: CellValue): CellValue {
  if (typeof value === "number") {
    return formatFormulaNumber(value);
  }
  if (typeof value === "boolean") {
    return value ? "ИСТИНА" : "ЛОЖЬ";
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}.${m}.${y}`;
  }
  return value;
}

/**
 * Calculates the formula columns of every row.
 *
 * @param data the stored database.
 * @param options today's date and a resolver of user names.
 * @returns columns typed by their values and rows with calculated cells.
 */
export function computeDatabase(
  data: Pick<DatabaseData, "columns" | "rows">,
  options: {
    today?: string;
    userName?: (id: string) => string | undefined;
  } = {}
): ComputedDatabase {
  const formulas = data.columns.filter((c) => c.type === ColumnType.Formula);
  if (!formulas.length) {
    return { columns: data.columns, rows: data.rows };
  }
  const today = options.today ?? todayValue();
  const byName = new Map<string, Column>();
  for (const column of data.columns) {
    const key = column.name.trim().toLowerCase();
    if (!byName.has(key)) {
      byName.set(key, column);
    }
  }
  const types = new Map<string, Set<ColumnType>>();

  const rows = data.rows.map((row): ComputedRow => {
    const results = new Map<string, FormulaValue | FormulaError>();
    const visiting = new Set<string>();

    const valueOf = (column: Column): FormulaValue => {
      if (column.type !== ColumnType.Formula) {
        return cellToFormula(column, row.cells[column.id], options.userName);
      }
      const done = results.get(column.id);
      if (done instanceof FormulaError) {
        throw done;
      }
      if (done !== undefined) {
        return done;
      }
      if (visiting.has(column.id)) {
        throw new FormulaError(`циклическая ссылка на «${column.name}»`);
      }
      visiting.add(column.id);
      try {
        const value = evaluateFormula(column.formula ?? "", {
          today,
          ref: (name) => {
            const target = byName.get(name.trim().toLowerCase());
            if (!target) {
              throw new FormulaError(`нет столбца «${name}»`);
            }
            return valueOf(target);
          },
        });
        results.set(column.id, value);
        return value;
      } catch (error) {
        const failure =
          error instanceof FormulaError
            ? error
            : new FormulaError(String(error));
        results.set(column.id, failure);
        throw failure;
      } finally {
        visiting.delete(column.id);
      }
    };

    const cells = { ...row.cells };
    const errors: Record<string, string> = {};
    for (const column of formulas) {
      try {
        const { cell, type } = formulaToCell(valueOf(column));
        cells[column.id] = cell;
        if (type) {
          const set = types.get(column.id) ?? new Set();
          set.add(type);
          types.set(column.id, set);
        }
      } catch (error) {
        cells[column.id] = null;
        errors[column.id] =
          error instanceof FormulaError ? error.message : String(error);
      }
    }
    return Object.keys(errors).length
      ? { ...row, cells, errors }
      : { ...row, cells };
  });

  const columns = data.columns.map((column): ComputedColumn => {
    if (column.type !== ColumnType.Formula) {
      return column;
    }
    const found = types.get(column.id);
    const type = found?.size === 1 ? [...found][0] : ColumnType.Text;
    if (found && found.size > 1) {
      for (const row of rows) {
        row.cells[column.id] = cellText(row.cells[column.id]);
      }
    }
    return { ...column, type, source: column };
  });

  return { columns, rows };
}
