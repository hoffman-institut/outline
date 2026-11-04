import type { Column, FilterRule, Row, View } from "./database";
import {
  ColumnType,
  ViewType,
  cellsForFilters,
  computeTotal,
  dateKey,
  fileToCell,
  formatDate,
  isImage,
  parseFiles,
  treeRows,
  convertValue,
  formatNumber,
  groupRows,
  nextAutoNumber,
  daysUntilAnniversary,
  displayValue,
  moveColumn,
  rowDropIndex,
  matchesFilter,
  normalizeDatabase,
  rowsForView,
} from "./database";

const name: Column = { id: "name", name: "Name", type: ColumnType.Text };
const birthday: Column = { id: "bd", name: "Birthday", type: ColumnType.Date };
const status: Column = {
  id: "st",
  name: "Status",
  type: ColumnType.Select,
  options: [
    { id: "todo", name: "To do", color: "gray" },
    { id: "done", name: "Done", color: "green" },
  ],
};
const tags: Column = {
  id: "tags",
  name: "Tags",
  type: ColumnType.MultiSelect,
  options: [
    { id: "a", name: "Alpha", color: "blue" },
    { id: "b", name: "Beta", color: "red" },
  ],
};

const view = (patch: Partial<View> = {}): View => ({
  id: "v",
  name: "Table",
  type: ViewType.Table,
  sort: [],
  filters: [],
  hidden: [],
  ...patch,
});

describe("daysUntilAnniversary", () => {
  it("counts days to this year's date", () => {
    expect(daysUntilAnniversary("1990-11-10", "2026-11-03")).toBe(7);
  });

  it("is zero on the day", () => {
    expect(daysUntilAnniversary("1985-11-03", "2026-11-03")).toBe(0);
  });

  it("wraps to next year once the date has passed", () => {
    expect(daysUntilAnniversary("1990-11-02", "2026-11-03")).toBe(364);
  });

  it("moves 29 February to 28 February in common years", () => {
    expect(daysUntilAnniversary("2000-02-29", "2027-02-27")).toBe(1);
  });

  it("ignores empty values", () => {
    expect(daysUntilAnniversary(null, "2026-11-03")).toBeUndefined();
  });
});

describe("rowsForView", () => {
  const rows: Row[] = [
    { id: "1", cells: { name: "Anna", bd: "1990-01-15", st: "done" } },
    { id: "2", cells: { name: "Boris", bd: "1988-11-20", st: "todo" } },
    { id: "3", cells: { name: "Vera", bd: "1995-11-05" } },
    { id: "4", cells: { name: "Gleb" } },
  ];
  const data = { columns: [name, birthday, status], rows };

  it("keeps document order without sort rules", () => {
    expect(rowsForView(data, view()).map((r) => r.id)).toEqual([
      "1",
      "2",
      "3",
      "4",
    ]);
  });

  it("puts the nearest birthdays first and empty dates last", () => {
    const result = rowsForView(
      data,
      view({ sort: [{ columnId: "bd", direction: "asc", upcoming: true }] }),
      "2026-11-03"
    );
    expect(result.map((r) => r.id)).toEqual(["3", "2", "1", "4"]);
  });

  it("sorts select columns by option order", () => {
    const result = rowsForView(
      data,
      view({ sort: [{ columnId: "st", direction: "asc" }] })
    );
    expect(result.map((r) => r.id)).toEqual(["2", "1", "3", "4"]);
  });

  it("filters by upcoming days", () => {
    const result = rowsForView(
      data,
      view({ filters: [{ columnId: "bd", operator: "next_days", value: 30 }] }),
      "2026-11-03"
    );
    expect(result.map((r) => r.id)).toEqual(["2", "3"]);
  });
});

describe("matchesFilter", () => {
  it("matches text case-insensitively", () => {
    expect(
      matchesFilter(name, "Анна Иванова", {
        columnId: "name",
        operator: "contains",
        value: "анна",
      })
    ).toBe(true);
  });

  it("checks multi-select membership", () => {
    expect(
      matchesFilter(tags, ["a"], {
        columnId: "tags",
        operator: "not_contains",
        value: "b",
      })
    ).toBe(true);
  });

  it("ignores unfinished filters", () => {
    expect(matchesFilter(name, "x", { columnId: "name", operator: "is" })).toBe(
      true
    );
  });
});

describe("convertValue", () => {
  it("turns text into select options by name", () => {
    expect(convertValue(name, status, "Done")).toBe("done");
  });

  it("parses DD.MM.YYYY into a date", () => {
    expect(convertValue(name, birthday, "05.11.1995")).toBe("1995-11-05");
  });

  it("joins multi-select names when becoming text", () => {
    expect(convertValue(tags, name, ["a", "b"])).toBe("Alpha, Beta");
  });
});

describe("displayValue", () => {
  it("formats dates as DD.MM.YYYY", () => {
    expect(displayValue(birthday, "1995-11-05")).toBe("05.11.1995");
  });
});

describe("normalizeDatabase", () => {
  it("fills defaults and drops broken entries", () => {
    const data = normalizeDatabase({
      title: "People",
      columns: [{ id: "x", name: "X", type: "nonsense" }, null],
      rows: [{ id: "r" }, { nope: true }],
    });
    expect(data.columns).toEqual([{ id: "x", name: "X", type: "text" }]);
    expect(data.rows).toEqual([{ id: "r", cells: {} }]);
    expect(data.views).toHaveLength(1);
  });
});

describe("moveColumn", () => {
  const columns = [name, birthday, status, tags];
  const ids = (list: Column[]) => list.map((c) => c.id);

  it("moves a column after a later one", () => {
    expect(ids(moveColumn(columns, "name", "st", true))).toEqual([
      "bd",
      "st",
      "name",
      "tags",
    ]);
  });

  it("moves a column before an earlier one", () => {
    expect(ids(moveColumn(columns, "tags", "name", false))).toEqual([
      "tags",
      "name",
      "bd",
      "st",
    ]);
  });

  it("keeps the order when dropped on itself", () => {
    expect(moveColumn(columns, "bd", "bd", true)).toBe(columns);
  });
});

describe("rowDropIndex", () => {
  const rows: Row[] = ["a", "b", "c", "d"].map((id) => ({ id, cells: {} }));

  it("drops above a later row", () => {
    // Without "a": b c d, above "c" -> index 1 -> b a c d.
    expect(rowDropIndex(rows, "a", "c", false)).toBe(1);
  });

  it("drops below the last row", () => {
    expect(rowDropIndex(rows, "b", "d", true)).toBe(3);
  });

  it("ignores a drop on itself or an unknown row", () => {
    expect(rowDropIndex(rows, "b", "b", true)).toBe(-1);
    expect(rowDropIndex(rows, "x", "b", true)).toBe(-1);
  });
});

describe("computeTotal", () => {
  it("counts filled, empty and unique values", () => {
    const values = ["a", "", null, "a", "b", undefined];
    expect(computeTotal("count", values)).toBe(6);
    expect(computeTotal("not_empty", values)).toBe(3);
    expect(computeTotal("empty", values)).toBe(3);
    expect(computeTotal("percent_not_empty", values)).toBe(50);
    expect(computeTotal("unique", values)).toBe(2);
    expect(computeTotal("unique", [["x", "y"], ["y"], []])).toBe(2);
  });

  it("calculates numbers and skips empty cells", () => {
    const values = [10, 2.5, null, 7.5];
    expect(computeTotal("sum", values)).toBe(20);
    expect(computeTotal("avg", values)).toBeCloseTo(6.667, 3);
    expect(computeTotal("min", values)).toBe(2.5);
    expect(computeTotal("max", values)).toBe(10);
    expect(computeTotal("avg", [null])).toBeUndefined();
    expect(computeTotal("sum", [])).toBe(0);
  });

  it("finds the earliest and latest dates", () => {
    const values = ["2026-05-02", null, "1990-02-05", "2001-12-31"];
    expect(computeTotal("earliest", values)).toBe("1990-02-05");
    expect(computeTotal("latest", values)).toBe("2026-05-02");
    expect(computeTotal("latest", [null])).toBeUndefined();
  });

  it("counts checkboxes", () => {
    const values = [true, false, true, null];
    expect(computeTotal("checked", values)).toBe(2);
    expect(computeTotal("unchecked", values)).toBe(2);
    expect(computeTotal("percent_checked", values)).toBe(50);
    expect(computeTotal("percent_checked", [])).toBeUndefined();
  });

  it("is kept by normalizeDatabase, unknown kinds are dropped", () => {
    const data = normalizeDatabase({
      views: [
        {
          id: "v",
          type: "table",
          totals: { name: "unique", bd: "nonsense" },
        },
      ],
    });
    expect(data.views[0].totals).toEqual({ name: "unique" });
  });
});

describe("number formats", () => {
  const plain = (s: string) => s.replace(/\s/g, " ");
  it("formats money, percents and thousands", () => {
    expect(formatNumber({}, 1250000.5)).toBe("1250000.5");
    expect(plain(formatNumber({ numberFormat: "grouped" }, 1250000.5))).toBe(
      "1 250 000,5"
    );
    expect(plain(formatNumber({ numberFormat: "ruble" }, 1500))).toBe(
      "1 500 ₽"
    );
    expect(plain(formatNumber({ numberFormat: "percent" }, 45))).toBe("45 %");
  });

  it("keeps numbers when a formatted column changes type", () => {
    const money: Column = {
      id: "m",
      name: "Sum",
      type: ColumnType.Number,
      numberFormat: "ruble",
    };
    const target: Column = { id: "m", name: "Sum", type: ColumnType.Number };
    expect(convertValue(money, target, 1500)).toBe(1500);
    expect(
      convertValue({ ...money, type: ColumnType.Text }, target, "1 500")
    ).toBe(1500);
  });
});

describe("relative date filters", () => {
  const today = "2026-11-04"; // Wednesday
  const filter = (operator: FilterRule["operator"], value?: number) => ({
    columnId: "bd",
    operator,
    value,
  });
  it("matches today, this week and this month", () => {
    expect(matchesFilter(birthday, "2026-11-04", filter("today"), today)).toBe(
      true
    );
    expect(
      matchesFilter(birthday, "2026-11-02", filter("this_week"), today)
    ).toBe(true);
    expect(
      matchesFilter(birthday, "2026-11-08", filter("this_week"), today)
    ).toBe(true);
    expect(
      matchesFilter(birthday, "2026-11-09", filter("this_week"), today)
    ).toBe(false);
    expect(
      matchesFilter(birthday, "2026-11-30", filter("this_month"), today)
    ).toBe(true);
    expect(matchesFilter(birthday, null, filter("today"), today)).toBe(false);
  });

  it("matches the last and the next N days", () => {
    expect(
      matchesFilter(birthday, "2026-10-28", filter("last_days", 7), today)
    ).toBe(true);
    expect(
      matchesFilter(birthday, "2026-10-27", filter("last_days", 7), today)
    ).toBe(false);
    expect(
      matchesFilter(birthday, "2026-11-14", filter("within_days", 10), today)
    ).toBe(true);
    expect(
      matchesFilter(birthday, "2025-11-14", filter("within_days", 10), today)
    ).toBe(false);
    // Unfinished filter keeps the row.
    expect(matchesFilter(birthday, null, filter("last_days"), today)).toBe(
      true
    );
  });
});

describe("relation filters and sorting", () => {
  const relation: Column = {
    id: "rel",
    name: "People",
    type: ColumnType.Relation,
    relation: { documentId: "d", databaseId: "db" },
  };
  it("filters by a linked row", () => {
    const rule = {
      columnId: "rel",
      operator: "contains" as const,
      value: "p1",
    };
    expect(matchesFilter(relation, ["p1", "p2"], rule)).toBe(true);
    expect(matchesFilter(relation, ["p2"], rule)).toBe(false);
    expect(
      matchesFilter(relation, ["p2"], { ...rule, operator: "not_contains" })
    ).toBe(true);
  });

  it("sorts by the titles of linked rows", () => {
    const rows = [
      {
        id: "a",
        cells: { rel: ["x"] },
        links: { rel: [{ id: "x", title: "Яна" }] },
      },
      {
        id: "b",
        cells: { rel: ["y"] },
        links: { rel: [{ id: "y", title: "Анна" }] },
      },
    ];
    const view: View = {
      id: "v",
      name: "V",
      type: ViewType.Table,
      sort: [{ columnId: "rel", direction: "asc" }],
      filters: [],
      hidden: [],
    };
    expect(
      rowsForView({ columns: [relation], rows }, view).map((r) => r.id)
    ).toEqual(["b", "a"]);
  });
});

describe("new rows", () => {
  it("get values that match the filters of the view", () => {
    const cells = cellsForFilters(
      [name, status, tags, { id: "ok", name: "Ok", type: ColumnType.Checkbox }],
      [
        { columnId: "st", operator: "is", value: "todo" },
        { columnId: "tags", operator: "contains", value: "vip" },
        { columnId: "ok", operator: "checked" },
        { columnId: "name", operator: "is_empty" },
      ]
    );
    expect(cells).toEqual({ st: "todo", tags: ["vip"], ok: true });
  });

  it("get the next auto number", () => {
    expect(
      nextAutoNumber(
        [{ cells: { n: 3 } }, { cells: { n: 7 } }, { cells: {} }],
        "n"
      )
    ).toBe(8);
    expect(nextAutoNumber([], "n")).toBe(1);
  });

  it("keep number formats and auto number prefixes in normalization", () => {
    const data = normalizeDatabase({
      columns: [
        {
          id: "a",
          name: "A",
          type: "number",
          numberFormat: "ruble",
          showAs: "bar",
          max: 50,
        },
        { id: "b", name: "B", type: "auto_number", prefix: "TASK-" },
        { id: "c", name: "C", type: "number", numberFormat: "bitcoin" },
      ],
      views: [{ id: "v", type: "table", newRowsFirst: true }],
    });
    expect(data.columns[0]).toMatchObject({
      numberFormat: "ruble",
      showAs: "bar",
      max: 50,
    });
    expect(data.columns[1]).toMatchObject({
      type: "auto_number",
      prefix: "TASK-",
    });
    expect(data.columns[2].numberFormat).toBeUndefined();
    expect(data.views[0].newRowsFirst).toBe(true);
    expect(displayValue(data.columns[1], 12)).toBe("TASK-12");
  });
});

describe("filter modes and groups", () => {
  const rows: Row[] = [
    { id: "a", cells: { st: "todo", tags: ["vip"] } },
    { id: "b", cells: { st: "done", tags: [] } },
    { id: "c", cells: { st: "done", tags: ["vip"] } },
  ];
  const view = (patch: Partial<View>): View => ({
    id: "v",
    name: "V",
    type: ViewType.Table,
    sort: [],
    filters: [],
    hidden: [],
    ...patch,
  });
  const todo = { columnId: "st", operator: "is" as const, value: "todo" };
  const vip = { columnId: "tags", operator: "contains" as const, value: "vip" };
  const ids = (v: View) =>
    rowsForView({ columns: [status, tags], rows }, v).map((r) => r.id);

  it("joins rules with and / or", () => {
    expect(ids(view({ filters: [todo, vip] }))).toEqual(["a"]);
    expect(ids(view({ filters: [todo, vip], filterMode: "or" }))).toEqual([
      "a",
      "c",
    ]);
  });

  it("evaluates groups of rules", () => {
    const done = { columnId: "st", operator: "is" as const, value: "done" };
    const noTags = { columnId: "tags", operator: "is_empty" as const };
    expect(
      ids(
        view({
          filters: [{ id: "g", mode: "or", rules: [todo, noTags] }, done],
          filterMode: "or",
        })
      )
    ).toEqual(["a", "b", "c"]);
    expect(
      ids(
        view({
          filters: [done, { id: "g", mode: "or", rules: [todo, noTags] }],
        })
      )
    ).toEqual(["b"]);
  });

  it("does not prefill new rows of an or-view", () => {
    expect(cellsForFilters([status], [todo], "or")).toEqual({});
  });
});

describe("groupRows", () => {
  const labels: Column = {
    id: "tags",
    name: "Labels",
    type: ColumnType.MultiSelect,
    options: [
      { id: "vip", name: "VIP", color: "red" },
      { id: "new", name: "New", color: "green" },
    ],
  };

  it("groups by option order, repeats multi-values, keeps empty last", () => {
    const rows: Row[] = [
      { id: "a", cells: { st: "done", tags: ["vip", "new"] } },
      { id: "b", cells: { st: "todo", tags: [] } },
      { id: "c", cells: { tags: ["new"] } },
    ];
    expect(
      groupRows(status, rows).map((g) => [g.key, g.rows.map((r) => r.id)])
    ).toEqual([
      ["todo", ["b"]],
      ["done", ["a"]],
      ["", ["c"]],
    ]);
    const byTag = groupRows(labels, rows);
    expect(byTag.map((g) => [g.label, g.rows.map((r) => r.id)])).toEqual([
      ["VIP", ["a"]],
      ["New", ["a", "c"]],
      ["", ["b"]],
    ]);
  });

  it("groups dates by month and by week", () => {
    const rows: Row[] = [
      { id: "a", cells: { bd: "2026-11-04" } },
      { id: "b", cells: { bd: "2026-10-30" } },
      { id: "c", cells: { bd: "2026-11-01" } },
    ];
    expect(
      groupRows(birthday, rows).map((g) => [g.key, g.rows.map((r) => r.id)])
    ).toEqual([
      ["2026-10-01", ["b"]],
      ["2026-11-01", ["a", "c"]],
    ]);
    // 2026-11-01 is a Sunday: same week as 2026-10-30 (Friday).
    expect(
      groupRows(birthday, rows, { dateUnit: "week" }).map((g) => [
        g.key,
        g.rows.map((r) => r.id),
      ])
    ).toEqual([
      ["2026-10-26", ["b", "c"]],
      ["2026-11-02", ["a"]],
    ]);
  });

  it("groups relations by linked rows", () => {
    const relation: Column = {
      id: "rel",
      name: "R",
      type: ColumnType.Relation,
    };
    const rows = [
      {
        id: "a",
        cells: { rel: ["x"] },
        links: { rel: [{ id: "x", title: "Яна" }] },
      },
      { id: "b", cells: { rel: [] }, links: { rel: [] } },
    ];
    expect(
      groupRows(relation, rows).map((g) => [g.label, g.rows.map((r) => r.id)])
    ).toEqual([
      ["Яна", ["a"]],
      ["", ["b"]],
    ]);
  });
});

describe("templates and forms", () => {
  it("keeps row templates and form views", () => {
    const data = normalizeDatabase({
      views: [{ id: "f", type: "form", hidden: ["x"] }],
      templates: [
        { id: "t1", name: "Встреча", cells: { st: "todo" }, pageId: "p1" },
        { name: "no id" },
      ],
    });
    expect(data.views[0].type).toBe(ViewType.Form);
    expect(data.templates).toEqual([
      { id: "t1", name: "Встреча", cells: { st: "todo" }, pageId: "p1" },
    ]);
    expect(normalizeDatabase({}).templates).toBeUndefined();
  });
});

describe("dates with a time", () => {
  // Built from local time, so the tests pass in any time zone.
  const at = (y: number, m: number, d: number, h: number, min = 0) =>
    new Date(y, m - 1, d, h, min).toISOString();

  it("shows the local day and time", () => {
    const value = at(2026, 11, 4, 23, 30);
    expect(dateKey(value)).toBe("2026-11-04");
    expect(formatDate(value)).toBe("04.11.2026 23:30");
    expect(formatDate("2026-11-04")).toBe("04.11.2026");
  });

  it("sorts by the moment and filters by the local day", () => {
    const column: Column = { ...birthday, withTime: true };
    const rows: Row[] = [
      { id: "late", cells: { bd: at(2026, 11, 4, 18) } },
      { id: "date", cells: { bd: "2026-11-04" } },
      { id: "early", cells: { bd: at(2026, 11, 4, 9) } },
    ];
    const view: View = {
      id: "v",
      name: "V",
      type: ViewType.Table,
      sort: [{ columnId: "bd", direction: "asc" }],
      filters: [{ columnId: "bd", operator: "today" }],
      hidden: [],
    };
    expect(
      rowsForView({ columns: [column], rows }, view, "2026-11-04").map(
        (r) => r.id
      )
    ).toEqual(["date", "early", "late"]);
  });
});

describe("files", () => {
  it("reads stored files and skips broken ones", () => {
    const photo = {
      id: "a",
      name: "photo.jpg",
      url: "/api/attachments.redirect?id=a",
    };
    const value = [
      fileToCell(photo),
      "not json",
      fileToCell({
        ...photo,
        id: "b",
        name: "act.pdf",
        type: "application/pdf",
      }),
    ];
    const files = parseFiles(value);
    expect(files.map((f) => f.name)).toEqual(["photo.jpg", "act.pdf"]);
    expect(isImage(files[0])).toBe(true);
    expect(isImage(files[1])).toBe(false);
    expect(
      displayValue({ id: "f", name: "F", type: ColumnType.Files }, value)
    ).toBe("photo.jpg, act.pdf");
  });

  it("keeps only uploads and web links", () => {
    const file = (url: string) => fileToCell({ id: url, name: "x", url });
    const files = parseFiles([
      file("/api/attachments.redirect?id=a"),
      file("https://disk.yandex.ru/i/abc"),
      file("javascript:alert(1)"),
      file("//evil.example/x"),
      file("/\\evil.example/x"),
      file("data:text/html,x"),
    ]);
    expect(files.map((f) => f.url)).toEqual([
      "/api/attachments.redirect?id=a",
      "https://disk.yandex.ru/i/abc",
    ]);
  });
});

describe("treeRows", () => {
  const rows: Row[] = [
    { id: "child", cells: { p: ["root"] } },
    { id: "root", cells: { p: [] } },
    { id: "grandchild", cells: { p: ["child"] } },
    { id: "orphan", cells: { p: ["hidden"] } },
    { id: "loopA", cells: { p: ["loopB"] } },
    { id: "loopB", cells: { p: ["loopA"] } },
  ];
  it("nests sub-items under their parents", () => {
    expect(
      treeRows(rows, "p").map((r) => [r.row.id, r.depth, r.childCount])
    ).toEqual([
      ["root", 0, 1],
      ["child", 1, 1],
      ["grandchild", 2, 0],
      ["orphan", 0, 0],
      ["loopA", 0, 1],
      ["loopB", 1, 1],
    ]);
  });
});
