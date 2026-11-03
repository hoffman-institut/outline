import type { Column, Row } from "./database";
import { ColumnType } from "./database";
import { computeDatabase, isComputed } from "./databaseCompute";

const price: Column = { id: "p", name: "Цена", type: ColumnType.Number };
const qty: Column = { id: "q", name: "Количество", type: ColumnType.Number };
const birthday: Column = { id: "bd", name: "ДР", type: ColumnType.Date };
const tags: Column = {
  id: "t",
  name: "Теги",
  type: ColumnType.MultiSelect,
  options: [
    { id: "vip", name: "VIP, ключевой", color: "red" },
    { id: "new", name: "Новый", color: "green" },
  ],
};
const formula = (id: string, name: string, source: string): Column => ({
  id,
  name,
  type: ColumnType.Formula,
  formula: source,
});

const rows: Row[] = [
  { id: "r1", cells: { p: 100, q: 3, bd: "1990-11-10", t: ["vip"] } },
  { id: "r2", cells: { p: 50, q: null, bd: null, t: [] } },
];

describe("computeDatabase", () => {
  it("returns the data unchanged without formula columns", () => {
    const data = { columns: [price, qty], rows };
    const result = computeDatabase(data);
    expect(result.columns).toBe(data.columns);
    expect(result.rows).toBe(rows);
  });

  it("calculates formulas and types the column by its results", () => {
    const total = formula("sum", "Сумма", "[Цена] * [Количество]");
    const result = computeDatabase({ columns: [price, qty, total], rows });
    expect(result.columns[2].type).toBe(ColumnType.Number);
    expect(isComputed(result.columns[2])).toBe(true);
    expect(result.columns[2].source).toBe(total);
    expect(result.rows.map((r) => r.cells.sum)).toEqual([300, null]);
    // Stored rows are not modified.
    expect(rows[0].cells.sum).toBeUndefined();
  });

  it("lets formulas use other formulas", () => {
    const result = computeDatabase(
      {
        columns: [
          price,
          qty,
          formula("sum", "Сумма", "[Цена] * [Количество]"),
          formula("vat", "С НДС", "[Сумма] * 1,2"),
        ],
        rows,
      },
      { today: "2026-11-04" }
    );
    expect(result.rows[0].cells.vat).toBe(360);
  });

  it("types dates and checkboxes", () => {
    const result = computeDatabase(
      {
        columns: [
          birthday,
          formula("next", "Следующий", "[ДР] + 365"),
          formula("soon", "Скоро", "ДНЕЙ_ДО([ДР]) <= 7"),
        ],
        rows,
      },
      { today: "2026-11-04" }
    );
    expect(result.columns[1].type).toBe(ColumnType.Date);
    expect(result.columns[2].type).toBe(ColumnType.Checkbox);
    expect(result.rows[0].cells.next).toBe("1991-11-10");
    expect(result.rows[1].cells.next).toBeNull();
    expect(result.rows[0].cells.soon).toBe(true);
    expect(result.rows[1].cells.soon).toBeNull();
  });

  it("turns mixed results into text", () => {
    const result = computeDatabase({
      columns: [
        qty,
        formula("f", "Ф", 'ЕСЛИ(ЕПУСТО([Количество]); "нет"; [Количество])'),
      ],
      rows,
    });
    expect(result.columns[1].type).toBe(ColumnType.Text);
    expect(result.rows.map((r) => r.cells.f)).toEqual(["3", "нет"]);
  });

  it("passes option names, including ones with commas", () => {
    const result = computeDatabase({
      columns: [tags, formula("f", "Ф", 'СОДЕРЖИТ([Теги]; "VIP, ключевой")')],
      rows,
    });
    expect(result.rows.map((r) => r.cells.f)).toEqual([true, false]);
  });

  it("reports errors per cell", () => {
    const result = computeDatabase({
      columns: [
        price,
        qty,
        formula("a", "А", "[Б] + 1"),
        formula("b", "Б", "[А] + 1"),
        formula("c", "В", "[Нет такого]"),
        formula("d", "Г", "[Цена] / [Количество]"),
      ],
      rows,
    });
    const [first, second] = result.rows;
    expect(first.errors?.a).toContain("циклическая ссылка");
    expect(first.errors?.c).toBe("нет столбца «Нет такого»");
    expect(first.cells.d).toBeCloseTo(33.333, 3);
    // An empty quantity gives an empty result, not a division error.
    expect(second.errors?.d).toBeUndefined();
    expect(second.cells.d).toBeNull();
  });
});
