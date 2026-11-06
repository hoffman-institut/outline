import type { Column, Row, View } from "./database";
import { ColumnType, ViewType, dayNumber, normalizeDatabase } from "./database";
import {
  dayKeyOf,
  dayKind,
  dayRuns,
  daysInYear,
  isWeekdayColumn,
  monthSpans,
  parseProductionCalendar,
  shiftPeriod,
  timelineLayout,
  timelineRange,
  weekdayIndex,
  weekdayOf,
  weekendCalendar,
} from "./timeline";

const d = dayNumber;

// The "Отсутствия" database: who is away and when.
const person: Column = {
  id: "who",
  name: "Сотрудник",
  type: ColumnType.Text,
};
const kind: Column = {
  id: "type",
  name: "Тип",
  type: ColumnType.Select,
  options: [
    { id: "vac", name: "Отпуск", color: "blue" },
    { id: "sick", name: "Больничный", color: "red" },
    { id: "wd", name: "Выходной день недели", color: "gray" },
    { id: "off", name: "Отгул", color: "orange" },
  ],
};
const from: Column = { id: "from", name: "С", type: ColumnType.Date };
const to: Column = { id: "to", name: "По", type: ColumnType.Date };
const weekday: Column = {
  id: "wday",
  name: "День недели",
  type: ColumnType.Select,
  options: ["Пн", "Вт", "Ср", "Чт", "Пт"].map((n, i) => ({
    id: `d${i}`,
    name: n,
    color: "gray" as const,
  })),
};
const columns = [person, kind, from, to, weekday];

const view: View = {
  id: "tl",
  name: "График",
  type: ViewType.Timeline,
  sort: [],
  filters: [],
  hidden: [],
  dateColumn: "from",
  endColumn: "to",
  colorColumn: "type",
  weekdayColumn: "wday",
};

const row = (id: string, cells: Row["cells"]): Row => ({ id, cells });

const november = timelineRange("2026-11-15", "month");

// isdayoff.ru, 2026, cc=ru, pre=1 (checked 05.11.2026).
const real2026 =
  "11111111111000001100000110000011000001100000110000011100001100000111000011000001100000110000011000001100000110000011000211100002111000011000001100000110000011000211100000110000011000001100000110000011000001100000110000011000001100000110000011000001100000110000011000001100000110000011000001100000110000011021001100000110000011000001100000110000011000001100000110001";

describe("timeline periods", () => {
  it("covers the month, quarter and year of a day", () => {
    expect(timelineRange("2026-11-15", "month")).toEqual({
      start: d("2026-11-01"),
      end: d("2026-11-30"),
    });
    expect(timelineRange("2026-11-15", "quarter")).toEqual({
      start: d("2026-10-01"),
      end: d("2026-12-31"),
    });
    expect(timelineRange("2028-02-10", "month").end).toBe(d("2028-02-29"));
    expect(timelineRange("2026-11-15", "year")).toEqual({
      start: d("2026-01-01"),
      end: d("2026-12-31"),
    });
  });

  it("moves by whole periods across years", () => {
    expect(shiftPeriod("2026-12-15", "month", 1)).toBe("2027-01-01");
    expect(shiftPeriod("2026-01-31", "month", -1)).toBe("2025-12-01");
    expect(shiftPeriod("2026-11-15", "quarter", 1)).toBe("2027-01-01");
    expect(shiftPeriod("2026-02-01", "quarter", -1)).toBe("2025-10-01");
    expect(shiftPeriod("2026-07-04", "year", -1)).toBe("2025-01-01");
  });

  it("splits a range into months", () => {
    const spans = monthSpans(timelineRange("2026-11-15", "quarter"));
    expect(spans.map((s) => [dayKeyOf(s.start), dayKeyOf(s.end)])).toEqual([
      ["2026-10-01", "2026-10-31"],
      ["2026-11-01", "2026-11-30"],
      ["2026-12-01", "2026-12-31"],
    ]);
  });

  it("knows days of the week and joins runs of days", () => {
    expect(weekdayOf(d("2026-11-02"))).toBe(0); // Monday
    expect(weekdayOf(d("2026-11-08"))).toBe(6); // Sunday
    expect(weekdayOf(d("1969-12-29"))).toBe(0); // before 1970
    expect(dayRuns([1, 2, 3, 5, 7, 8])).toEqual([
      [1, 3],
      [5, 5],
      [7, 8],
    ]);
    expect(dayRuns([])).toEqual([]);
  });
});

describe("production calendar", () => {
  it("reads the digits of the service", () => {
    expect(daysInYear(2026)).toBe(365);
    expect(daysInYear(2028)).toBe(366);
    const days = parseProductionCalendar(`${real2026}\n`, 2026)!;
    expect(days).toHaveLength(365);
    const at = (key: string) => dayKind(d(key), { 2026: days });
    expect(at("2026-01-01")).toBe("off");
    expect(at("2026-11-03")).toBe("short");
    expect(at("2026-11-04")).toBe("off"); // Unity Day, a Wednesday
    expect(at("2026-11-05")).toBe("working");
    expect(at("2026-11-07")).toBe("off"); // Saturday
    expect(at("2026-12-31")).toBe("off");
  });

  it("rejects error codes and calendars of another length", () => {
    expect(parseProductionCalendar("101", 2035)).toBeUndefined();
    expect(parseProductionCalendar("199", 2026)).toBeUndefined();
    expect(parseProductionCalendar(real2026, 2028)).toBeUndefined();
    expect(
      parseProductionCalendar(real2026.replace(/^1/, "x"), 2026)
    ).toBeUndefined();
  });

  it("falls back to Saturdays and Sundays", () => {
    const weekends = weekendCalendar(2026);
    expect(weekends).toHaveLength(365);
    expect(dayKind(d("2026-11-04"), { 2026: weekends })).toBe("working");
    expect(dayKind(d("2026-11-07"), { 2026: weekends })).toBe("off");
    // A year without any calendar.
    expect(dayKind(d("2030-01-05"), {})).toBe("off");
    expect(dayKind(d("2030-01-07"), {})).toBe("working");
  });
});

describe("weekday options", () => {
  it("reads short, full and English names", () => {
    expect(weekdayIndex("Пн")).toBe(0);
    expect(weekdayIndex(" ср. ")).toBe(2);
    expect(weekdayIndex("Пятница")).toBe(4);
    expect(weekdayIndex("Sun")).toBe(6);
    expect(weekdayIndex("Средний")).toBeUndefined();
    expect(weekdayIndex("Отпуск")).toBeUndefined();
  });

  it("finds a column of weekdays", () => {
    expect(isWeekdayColumn(weekday)).toBe(true);
    expect(isWeekdayColumn(kind)).toBe(false);
    expect(isWeekdayColumn({ ...weekday, options: [] })).toBe(false);
  });
});

describe("timelineLayout", () => {
  // Today for rows without an end.
  const at = { today: "2026-11-15" };
  const rows = [
    row("a1", {
      who: "Анна",
      type: "vac",
      from: "2026-11-09",
      to: "2026-11-20",
    }),
    row("b1", {
      who: "Борис",
      type: "sick",
      from: "2026-11-18",
      to: "2026-11-24",
    }),
    // Wednesday off every week from 11.11.2026, without an end.
    row("b2", { who: "Борис", type: "wd", wday: "d2", from: "2026-11-11" }),
    // A vacation from October to December is clipped to November.
    row("c1", {
      who: "Вера",
      type: "vac",
      from: "2026-10-20",
      to: "2026-12-05",
    }),
    // Weekly day off that ended before November.
    row("c2", {
      who: "Вера",
      type: "wd",
      wday: "d0",
      from: "2026-01-01",
      to: "2026-10-31",
    }),
    row("e1", { who: "", type: "off", from: "2026-12-01" }),
  ];
  const layout = timelineLayout(columns, rows, view, november, at);
  const lane = (label: string) => layout.lanes.find((l) => l.label === label)!;

  it("makes one lane per value, also without bars in the range", () => {
    expect(layout.lanes.map((l) => l.label)).toEqual([
      "Анна",
      "Борис",
      "Вера",
      "",
    ]);
    expect(lane("").items).toEqual([]);
    expect(lane("").levels).toBe(1);
  });

  it("puts bars from start to end, clipped to the range", () => {
    const [bar] = lane("Анна").items;
    expect(bar).toMatchObject({
      start: d("2026-11-09"),
      end: d("2026-11-20"),
      before: false,
      after: false,
      level: 0,
    });
    expect(bar.weekly).toBeUndefined();

    const [long] = lane("Вера").items;
    expect(long).toMatchObject({
      start: november.start,
      end: november.end,
      before: true,
      after: true,
    });
    // The October day off has no marks in November.
    expect(lane("Вера").items).toHaveLength(1);
  });

  it("marks weekly days from the start to the end of the range", () => {
    const marks = lane("Борис").items.find((i) => i.row.id === "b2")!;
    expect(marks.weekly!.map(dayKeyOf)).toEqual([
      "2026-11-11",
      "2026-11-18",
      "2026-11-25",
    ]);
    expect(marks).toMatchObject({ before: false, after: true });
  });

  it("marks weekly days without dates in the whole range", () => {
    const always = timelineLayout(
      columns,
      [row("x", { who: "Дина", wday: "d4" })],
      view,
      november,
      at
    );
    expect(always.lanes[0].items[0].weekly!.map(dayKeyOf)).toEqual([
      "2026-11-06",
      "2026-11-13",
      "2026-11-20",
      "2026-11-27",
    ]);
  });

  it("swaps reversed dates of weekly rows", () => {
    const reversed = timelineLayout(
      columns,
      [
        row("x", {
          who: "Дина",
          wday: "d0",
          from: "2026-11-20",
          to: "2026-11-05",
        }),
      ],
      view,
      november,
      at
    );
    expect(reversed.lanes[0].items[0].weekly!.map(dayKeyOf)).toEqual([
      "2026-11-09",
      "2026-11-16",
    ]);
  });

  it("stacks items of a lane that meet", () => {
    const borisLevels = lane("Борис").items.map((i) => [i.row.id, i.level]);
    expect(borisLevels).toEqual([
      ["b2", 0],
      ["b1", 1],
    ]);
    expect(lane("Борис").levels).toBe(2);
  });

  it("highlights working days where bars of two or more lanes meet", () => {
    const days = [...layout.overlaps.keys()].map(dayKeyOf);
    // Анна and Вера from 09.11 to 20.11, Борис and Вера from 18.11 to 24.11;
    // without a calendar Saturdays and Sundays do not count.
    expect(days[0]).toBe("2026-11-09");
    expect(days[days.length - 1]).toBe("2026-11-24");
    expect(days).toHaveLength(12);
    expect(layout.overlaps.get(d("2026-11-19"))).toEqual([
      "Анна",
      "Борис",
      "Вера",
    ]);
    expect(layout.overlaps.has(d("2026-11-21"))).toBe(false);
    expect(layout.overlaps.get(d("2026-11-23"))).toEqual(["Борис", "Вера"]);
  });

  it("does not count holidays, counts shortened days", () => {
    const calendars = { 2026: real2026 };
    const two = (first: [string, string], second: [string, string]) =>
      timelineLayout(
        columns,
        [
          row("1", { who: "Анна", from: first[0], to: first[1] }),
          row("2", { who: "Борис", from: second[0], to: second[1] }),
        ],
        view,
        november,
        { ...at, calendars }
      ).overlaps;
    // Only on 04.11.2026, Unity Day.
    expect(
      two(["2026-11-02", "2026-11-04"], ["2026-11-04", "2026-11-06"]).size
    ).toBe(0);
    // Only on 03.11.2026, a shortened working day.
    const shortened = two(
      ["2026-11-02", "2026-11-03"],
      ["2026-11-03", "2026-11-06"]
    );
    expect([...shortened.keys()].map(dayKeyOf)).toEqual(["2026-11-03"]);
    // Only on Saturday 07.11.2026, also without a calendar.
    const saturday = timelineLayout(
      columns,
      [
        row("1", { who: "Анна", from: "2026-11-05", to: "2026-11-07" }),
        row("2", { who: "Борис", from: "2026-11-07", to: "2026-11-08" }),
      ],
      view,
      november,
      at
    );
    expect(saturday.overlaps.size).toBe(0);
  });

  it("needs two rows for an overlap, not one row on two lanes", () => {
    const team: Column = {
      id: "team",
      name: "Команда",
      type: ColumnType.MultiSelect,
      options: [
        { id: "a", name: "Анна", color: "gray" },
        { id: "b", name: "Борис", color: "gray" },
      ],
    };
    const byTeam = { ...view, laneColumn: "team" };
    const both = row("1", {
      team: ["a", "b"],
      from: "2026-11-09",
      to: "2026-11-13",
    });
    const alone = timelineLayout(
      [...columns, team],
      [both],
      byTeam,
      november,
      at
    );
    expect(alone.lanes.map((l) => l.items.length)).toEqual([1, 1]);
    expect(alone.overlaps.size).toBe(0);

    const withOther = timelineLayout(
      [...columns, team],
      [both, row("2", { team: ["b"], from: "2026-11-12", to: "2026-11-20" })],
      byTeam,
      november,
      at
    );
    expect([...withOther.overlaps.keys()].map(dayKeyOf)).toEqual([
      "2026-11-12",
      "2026-11-13",
    ]);
    expect(withOther.overlaps.get(d("2026-11-12"))).toEqual(["Анна", "Борис"]);
  });

  it("does not count weekly marks or two bars of one lane", () => {
    const own = timelineLayout(
      columns,
      [
        row("1", { who: "Анна", from: "2026-11-02", to: "2026-11-06" }),
        row("2", { who: "Анна", from: "2026-11-04", to: "2026-11-05" }),
        row("3", { who: "Борис", wday: "d2" }),
      ],
      view,
      november,
      at
    );
    expect(own.overlaps.size).toBe(0);
    expect(own.lanes[0].levels).toBe(2);
  });

  it("bars without an end last until today", () => {
    const result = timelineLayout(
      columns,
      [
        row("1", { who: "Анна", from: "2026-11-10" }),
        row("2", { who: "Борис", from: "2026-10-20" }),
        // Starts after today: one day.
        row("3", { who: "Вера", from: "2026-11-20" }),
      ],
      view,
      november,
      at
    );
    const items = result.lanes.map((l) => l.items[0]);
    expect(items.map((i) => [dayKeyOf(i.start), dayKeyOf(i.end)])).toEqual([
      ["2026-11-10", "2026-11-15"],
      ["2026-11-01", "2026-11-15"],
      ["2026-11-20", "2026-11-20"],
    ]);
    expect(items.map((i) => !!i.ongoing)).toEqual([true, true, false]);
    expect(items[1]).toMatchObject({ before: true, after: false });

    // A view without an end column shows single days.
    const single = timelineLayout(
      columns,
      [row("1", { who: "Анна", from: "2026-11-10" })],
      { ...view, endColumn: undefined },
      november,
      at
    );
    expect(single.lanes[0].items[0]).toMatchObject({
      start: d("2026-11-10"),
      end: d("2026-11-10"),
    });
  });

  it("makes one-day bars in the future and swaps reversed dates", () => {
    const result = timelineLayout(
      columns,
      [
        row("1", { who: "Анна", from: "2026-11-23" }),
        row("2", { who: "Борис", from: "2026-11-10", to: "2026-11-08" }),
        row("3", { who: "Вера", to: "2026-11-08" }),
      ],
      view,
      november,
      at
    );
    const spans = result.lanes.map((l) =>
      l.items.map((i) => [dayKeyOf(i.start), dayKeyOf(i.end)])
    );
    expect(spans).toEqual([
      [["2026-11-23", "2026-11-23"]],
      [["2026-11-08", "2026-11-10"]],
      [],
    ]);
  });

  it("uses the lane column of the view", () => {
    const byType = timelineLayout(
      columns,
      rows,
      { ...view, laneColumn: "type" },
      november,
      at
    );
    // Options in their order; lanes without bars stay.
    expect(byType.lanes.map((l) => l.label)).toEqual([
      "Отпуск",
      "Больничный",
      "Выходной день недели",
      "Отгул",
    ]);
  });

  it("needs a start date column", () => {
    expect(
      timelineLayout(
        columns,
        rows,
        { ...view, dateColumn: "who" },
        november,
        at
      ).lanes
    ).toEqual([]);
  });
});

describe("timeline view fields", () => {
  const raw = {
    views: [
      {
        ...view,
        laneColumn: "who",
        labelColumn: "type",
        timelineScale: "quarter",
      },
      {
        id: "bad",
        name: "Bad",
        type: "timeline",
        endColumn: 5,
        laneColumn: "",
        colorColumn: null,
        labelColumn: 7,
        weekdayColumn: ["wday"],
        timelineScale: "decade",
      },
    ],
  };

  it("are kept by normalizeDatabase and survive JSON", () => {
    const data = normalizeDatabase(raw);
    expect(data.views[0]).toEqual({
      ...view,
      laneColumn: "who",
      labelColumn: "type",
      timelineScale: "quarter",
    });
    const again = normalizeDatabase(JSON.parse(JSON.stringify(data)));
    expect(again.views).toEqual(data.views);
  });

  it("drop unknown values", () => {
    const bad = normalizeDatabase(raw).views[1];
    expect(bad.type).toBe(ViewType.Timeline);
    expect(bad).toEqual({
      id: "bad",
      name: "Bad",
      type: ViewType.Timeline,
      sort: [],
      filters: [],
      hidden: [],
    });
  });

  it("keep every scale", () => {
    for (const scale of ["month", "quarter", "year"]) {
      const [v] = normalizeDatabase({
        views: [{ ...view, timelineScale: scale }],
      }).views;
      expect(v.timelineScale).toBe(scale);
    }
  });
});
