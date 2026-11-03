import type { Column, DatabaseData, Row } from "./database";
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

describe("computeDatabase with relations", () => {
  const peopleRef = { documentId: "doc-team", databaseId: "people" };
  const projectsRef = { documentId: "doc-projects", databaseId: "projects" };
  const people: DatabaseData = {
    title: "Сотрудники",
    views: [],
    columns: [
      { id: "pn", name: "Имя", type: ColumnType.Text },
      { id: "ps", name: "Ставка", type: ColumnType.Number },
      { id: "pd", name: "Начало", type: ColumnType.Date },
      {
        id: "pb",
        name: "Проекты",
        type: ColumnType.Backlink,
        relation: { ...projectsRef, columnId: "team" },
      },
    ],
    rows: [
      { id: "p1", cells: { pn: "Анна", ps: 100, pd: "2024-03-01" } },
      { id: "p2", cells: { pn: "Борис", ps: 200, pd: "2023-01-15" } },
      { id: "p3", cells: { pn: "Вера", ps: 300 } },
    ],
  };
  const team: Column = {
    id: "team",
    name: "Команда",
    type: ColumnType.Relation,
    relation: peopleRef,
  };
  const rollup = (
    id: string,
    name: string,
    targetColumnId: string,
    fn: NonNullable<Column["rollup"]>["fn"]
  ): Column => ({
    id,
    name,
    type: ColumnType.Rollup,
    rollup: { columnId: "team", targetColumnId, fn },
  });
  const projects: DatabaseData = {
    title: "Проекты",
    views: [],
    columns: [
      { id: "name", name: "Проект", type: ColumnType.Text },
      team,
      rollup("sum", "Сумма ставок", "ps", "sum"),
      rollup("cnt", "Людей", "pn", "count"),
      rollup("names", "Кто", "pn", "values"),
      rollup("first", "С кого начали", "pd", "earliest"),
      formula("f", "Большая", "СЧЁТЗ([Команда]) >= 2"),
    ],
    rows: [
      { id: "r1", cells: { name: "Сайт", team: ["p1", "p2", "gone"] } },
      { id: "r2", cells: { name: "Склад", team: [] } },
    ],
  };
  const related = (ref: { documentId: string; databaseId: string }) =>
    ref.databaseId === "people"
      ? people
      : ref.databaseId === "projects"
        ? projects
        : undefined;

  it("shows linked rows and skips deleted ones", () => {
    const result = computeDatabase(projects, { related });
    expect(result.rows[0].links?.team).toEqual([
      { id: "p1", title: "Анна" },
      { id: "p2", title: "Борис" },
    ]);
    // Stored ids stay as they are.
    expect(result.rows[0].cells.team).toEqual(["p1", "p2", "gone"]);
    expect(result.columns[1].source).toBeUndefined();
  });

  it("calculates rollups and formulas over relations", () => {
    const result = computeDatabase(projects, { related });
    const [site, store] = result.rows;
    expect(result.columns.find((c) => c.id === "sum")?.type).toBe(
      ColumnType.Number
    );
    expect(result.columns.find((c) => c.id === "first")?.type).toBe(
      ColumnType.Date
    );
    expect(site.cells.sum).toBe(300);
    expect(site.cells.cnt).toBe(2);
    expect(site.cells.names).toBe("Анна, Борис");
    expect(site.cells.first).toBe("2023-01-15");
    expect(site.cells.f).toBe(true);
    expect(store.cells.sum).toBe(0);
    expect(store.cells.cnt).toBe(0);
    expect(store.cells.first).toBeNull();
    expect(store.cells.f).toBe(false);
  });

  it("finds backlinks", () => {
    const result = computeDatabase(people, { related });
    const backlink = result.columns.find((c) => c.id === "pb");
    expect(backlink?.source).toBeDefined();
    expect(result.rows.map((r) => r.cells.pb)).toEqual([["r1"], ["r1"], []]);
    expect(result.rows[0].links?.pb).toEqual([{ id: "r1", title: "Сайт" }]);
  });

  it("waits for a linked database without errors", () => {
    const result = computeDatabase(projects, { related: () => undefined });
    expect(result.rows[0].links?.team).toEqual([
      { id: "p1", title: "" },
      { id: "p2", title: "" },
      { id: "gone", title: "" },
    ]);
    expect(result.rows[0].cells.sum).toBeNull();
    expect(result.rows[0].errors).toBeUndefined();
  });

  it("reports a rollup without a relation", () => {
    const broken: Column = {
      id: "b",
      name: "Сломанная",
      type: ColumnType.Rollup,
      rollup: { columnId: "nope", targetColumnId: "ps", fn: "sum" },
    };
    const result = computeDatabase(
      { columns: [...projects.columns, broken], rows: projects.rows },
      { related }
    );
    expect(result.rows[0].errors?.b).toBe("сводка: выберите связь");
  });

  it("does not follow links of linked databases", () => {
    // People link back to projects and projects to people: no loop.
    const result = computeDatabase(people, { related });
    expect(result.rows).toHaveLength(3);
  });
});
