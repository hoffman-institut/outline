import type { Column, Row, View } from "./database";
import {
  ColumnType,
  ViewType,
  convertValue,
  daysUntilAnniversary,
  displayValue,
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
