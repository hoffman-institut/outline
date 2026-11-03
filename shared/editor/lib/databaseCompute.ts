import type {
  CellValue,
  Column,
  DatabaseData,
  DatabaseRef,
  Row,
} from "./database";
import {
  ColumnType,
  computeTotal,
  displayValue,
  isEmptyValue,
  todayValue,
} from "./database";
import type { FormulaValue } from "./formula";
import {
  FormulaError,
  evaluateFormula,
  formatFormulaNumber,
  formulaValue,
} from "./formula";

/** A linked row as relation cells show it. */
export type LinkedRow = { id: string; title: string };

export type ComputedRow = Row & {
  /** Errors of failed calculations, by column id. */
  errors?: Record<string, string>;
  /** Relation and backlink columns: the linked rows, by column id. */
  links?: Record<string, LinkedRow[]>;
};

/**
 * A column as the views see it. Calculated columns (formula, backlink,
 * rollup) keep the stored column in `source`; formulas and rollups get the
 * type of their values (number, date, checkbox or text), so sorting, filters
 * and totals work on the values.
 */
export type ComputedColumn = Column & { source?: Column };

/**
 * Database with calculated values, for display only. Never save these
 * columns or cells: the document stores formulas and relations, not results.
 */
export type ComputedDatabase = {
  columns: ComputedColumn[];
  rows: ComputedRow[];
};

export type ComputeOptions = {
  /** Today as "YYYY-MM-DD". */
  today?: string;
  userName?: (id: string) => string | undefined;
  /** Data of a linked database; undefined while loading or unavailable. */
  related?: (ref: DatabaseRef) => DatabaseData | undefined;
};

export const isComputed = (column: ComputedColumn) => !!column.source;

/** Column types whose values are calculated, not stored. */
export const calculatedTypes = [
  ColumnType.Formula,
  ColumnType.Backlink,
  ColumnType.Rollup,
];

const linkTypes = [ColumnType.Relation, ColumnType.Backlink];

const refKey = (ref: DatabaseRef) => `${ref.documentId}/${ref.databaseId}`;

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

/** Type of the values of a rollup. */
export function rollupType(column: Column): ColumnType {
  switch (column.rollup?.fn) {
    case "values":
      return ColumnType.Text;
    case "earliest":
    case "latest":
      return ColumnType.Date;
    default:
      return ColumnType.Number;
  }
}

/**
 * Rows of a database with their titles (the first column), for relation
 * cells and pickers.
 */
export function linkedRows(
  data: ComputedDatabase,
  userName?: (id: string) => string | undefined
): LinkedRow[] {
  const title = data.columns[0];
  return data.rows.map((row) => ({
    id: row.id,
    title: title ? displayValue(title, row.cells[title.id], userName) : "",
  }));
}

/**
 * Calculates formulas, relations, backlinks and rollups of every row.
 * Linked databases are calculated one level deep: their own relations are
 * not followed, so databases linking each other cannot loop.
 *
 * @param data the stored database.
 * @param options today's date, user names and linked databases.
 * @returns columns typed by their values and rows with calculated cells.
 */
export function computeDatabase(
  data: Pick<DatabaseData, "columns" | "rows">,
  options: ComputeOptions = {}
): ComputedDatabase {
  const special = data.columns.filter(
    (c) => calculatedTypes.includes(c.type) || c.type === ColumnType.Relation
  );
  if (!special.length) {
    return { columns: data.columns, rows: data.rows };
  }
  const today = options.today ?? todayValue();
  const byId = new Map(data.columns.map((c) => [c.id, c]));
  const byName = new Map<string, Column>();
  for (const column of data.columns) {
    const key = column.name.trim().toLowerCase();
    if (!byName.has(key)) {
      byName.set(key, column);
    }
  }

  // Linked databases, by reference, with the titles of their rows.
  const linked = new Map<
    string,
    { data: ComputedDatabase; titles: Map<string, string> } | null
  >();
  const linkedOf = (column: Column) => {
    if (!column.relation) {
      return undefined;
    }
    const key = refKey(column.relation);
    if (!linked.has(key)) {
      const target = options.related?.(column.relation);
      if (target) {
        const computed = computeDatabase(target, {
          today,
          userName: options.userName,
        });
        linked.set(key, {
          data: computed,
          titles: new Map(
            linkedRows(computed, options.userName).map((r) => [r.id, r.title])
          ),
        });
      } else {
        linked.set(key, null);
      }
    }
    return linked.get(key) ?? undefined;
  };

  const types = new Map<string, Set<ColumnType>>();

  const rows = data.rows.map((row): ComputedRow => {
    const cells = { ...row.cells };
    const errors: Record<string, string> = {};
    const links: Record<string, LinkedRow[]> = {};

    // Relations store row ids; backlinks find the rows that link here.
    const linksOf = (column: Column): LinkedRow[] => {
      if (links[column.id]) {
        return links[column.id];
      }
      const target = linkedOf(column);
      let ids: string[] = [];
      if (column.type === ColumnType.Relation) {
        const value = row.cells[column.id];
        ids = Array.isArray(value) ? value : [];
      } else if (target && column.relation?.columnId) {
        const via = column.relation.columnId;
        ids = target.data.rows
          .filter((r) => {
            const value = r.cells[via];
            return Array.isArray(value) && value.includes(row.id);
          })
          .map((r) => r.id);
      }
      // Rows deleted from the linked database are skipped; while it loads,
      // stored ids are kept without titles.
      links[column.id] = target
        ? ids
            .filter((id) => target.titles.has(id))
            .map((id) => ({ id, title: target.titles.get(id) ?? "" }))
        : ids.map((id) => ({ id, title: "" }));
      return links[column.id];
    };

    const rollupOf = (column: Column): FormulaValue => {
      const spec = column.rollup;
      const via = spec && byId.get(spec.columnId);
      if (!spec || !via || !linkTypes.includes(via.type)) {
        throw new FormulaError("сводка: выберите связь");
      }
      const target = linkedOf(via);
      if (!target) {
        return null;
      }
      const targetColumn = target.data.columns.find(
        (c) => c.id === spec.targetColumnId
      );
      if (!targetColumn) {
        throw new FormulaError("сводка: нет столбца в связанной базе");
      }
      const ids = new Set(linksOf(via).map((r) => r.id));
      const values = target.data.rows
        .filter((r) => ids.has(r.id))
        .map((r) => r.cells[targetColumn.id]);
      if (spec.fn === "values") {
        return values
          .map((v) => displayValue(targetColumn, v, options.userName))
          .filter(Boolean);
      }
      const total = computeTotal(spec.fn, values);
      if (total === undefined) {
        return null;
      }
      return typeof total === "string" ? { date: total } : total;
    };

    const results = new Map<string, FormulaValue | FormulaError>();
    const visiting = new Set<string>();

    const valueOf = (column: Column): FormulaValue => {
      if (linkTypes.includes(column.type)) {
        return linksOf(column).map((r) => r.title);
      }
      if (
        column.type !== ColumnType.Formula &&
        column.type !== ColumnType.Rollup
      ) {
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
        const value =
          column.type === ColumnType.Rollup
            ? rollupOf(column)
            : evaluateFormula(column.formula ?? "", {
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

    for (const column of special) {
      if (linkTypes.includes(column.type)) {
        const rowsLinked = linksOf(column);
        if (column.type === ColumnType.Backlink) {
          cells[column.id] = rowsLinked.map((r) => r.id);
        }
        continue;
      }
      try {
        const value = valueOf(column);
        if (column.type === ColumnType.Rollup) {
          const { cell } = formulaToCell(value);
          // Dates of earliest/latest stay "YYYY-MM-DD" for the date type.
          cells[column.id] = formulaValue.isDate(value) ? value.date : cell;
          continue;
        }
        const { cell, type } = formulaToCell(value);
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
    return {
      ...row,
      cells,
      ...(Object.keys(errors).length ? { errors } : {}),
      ...(Object.keys(links).length ? { links } : {}),
    };
  });

  const columns = data.columns.map((column): ComputedColumn => {
    switch (column.type) {
      case ColumnType.Backlink:
        return { ...column, source: column };
      case ColumnType.Rollup:
        return { ...column, type: rollupType(column), source: column };
      case ColumnType.Formula: {
        const found = types.get(column.id);
        const type = found?.size === 1 ? [...found][0] : ColumnType.Text;
        if (found && found.size > 1) {
          for (const row of rows) {
            row.cells[column.id] = cellText(row.cells[column.id]);
          }
        }
        return { ...column, type, source: column };
      }
      default:
        return column;
    }
  });

  return { columns, rows };
}
