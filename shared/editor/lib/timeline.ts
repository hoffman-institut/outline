import type { CellValue, Column, Row, TimelineScale, View } from "./database";
import { ColumnType, dateKey, dayNumber, groupRows } from "./database";

/**
 * Pure helpers of the timeline view: the period shown, bars and weekly marks
 * of rows on lanes, overlaps between lanes and the production calendar.
 * Days are day numbers (days since 1970-01-01), so time zones and daylight
 * saving never move them.
 */

const DAY = 86400000;

/** First and last day of a period, both included. */
export type DayRange = { start: number; end: number };

/** "YYYY-MM-DD" of a day number. */
export const dayKeyOf = (day: number) =>
  new Date(day * DAY).toISOString().slice(0, 10);

/** Day of the week of a day number: 0 is Monday, 6 is Sunday. */
export const weekdayOf = (day: number) => (((day + 3) % 7) + 7) % 7;

const monthsIn = (scale: TimelineScale) =>
  scale === "year" ? 12 : scale === "quarter" ? 3 : 1;

/**
 * The days a timeline shows: the month, quarter or year of a day.
 *
 * @param cursor a day of the period, "YYYY-MM-DD".
 * @param scale the period.
 * @returns the first and last day.
 */
export function timelineRange(cursor: string, scale: TimelineScale): DayRange {
  const year = +cursor.slice(0, 4);
  const month = +cursor.slice(5, 7) - 1;
  const months = monthsIn(scale);
  const first = month - (month % months);
  return {
    start: Date.UTC(year, first, 1) / DAY,
    end: Date.UTC(year, first + months, 0) / DAY,
  };
}

/**
 * First day of a period before or after the period of a day.
 *
 * @param cursor a day of the current period, "YYYY-MM-DD".
 * @param scale the period.
 * @param delta how many periods to move, negative for earlier ones.
 * @returns the first day of that period, "YYYY-MM-DD".
 */
export function shiftPeriod(
  cursor: string,
  scale: TimelineScale,
  delta: number
): string {
  const year = +cursor.slice(0, 4);
  const month = +cursor.slice(5, 7) - 1;
  const months = monthsIn(scale);
  const first = month - (month % months) + delta * months;
  return dayKeyOf(Date.UTC(year, first, 1) / DAY);
}

/**
 * Months of a range, each clipped to the range.
 *
 * @param range the days shown.
 * @returns first and last day of every month.
 */
export function monthSpans(range: DayRange): DayRange[] {
  const spans: DayRange[] = [];
  for (let start = range.start; start <= range.end;) {
    const key = dayKeyOf(start);
    const end = Math.min(
      Date.UTC(+key.slice(0, 4), +key.slice(5, 7), 0) / DAY,
      range.end
    );
    spans.push({ start, end });
    start = end + 1;
  }
  return spans;
}

/**
 * Joins sorted days into runs of consecutive days.
 *
 * @param days day numbers in ascending order.
 * @returns runs as [first, last].
 */
export function dayRuns(days: number[]): [number, number][] {
  const runs: [number, number][] = [];
  for (const day of days) {
    const last = runs[runs.length - 1];
    if (last && day === last[1] + 1) {
      last[1] = day;
    } else if (!last || day > last[1]) {
      runs.push([day, day]);
    }
  }
  return runs;
}

/** Kind of a day in the production calendar. */
export type DayKind = "working" | "off" | "short";

export const daysInYear = (year: number) =>
  (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY;

/**
 * Reads the production calendar of Russia for a year as isdayoff.ru gives
 * it (`/api/getdata?year=YYYY&cc=ru&pre=1`): one digit per day, 0 working,
 * 1 non-working, 2 shortened working day.
 *
 * @param text the answer of the service.
 * @param year the year asked for.
 * @returns the digits, or undefined when the answer is not a calendar of
 * that year (errors are short codes like "101").
 */
export function parseProductionCalendar(
  text: string,
  year: number
): string | undefined {
  const days = text.trim();
  return days.length === daysInYear(year) && /^[012]+$/.test(days)
    ? days
    : undefined;
}

/**
 * A calendar with Saturdays and Sundays off, used when the production
 * calendar is not available.
 *
 * @param year the year.
 * @returns one digit per day, like parseProductionCalendar.
 */
export function weekendCalendar(year: number): string {
  const first = Date.UTC(year, 0, 1) / DAY;
  return Array.from({ length: daysInYear(year) }, (_, i) =>
    weekdayOf(first + i) >= 5 ? "1" : "0"
  ).join("");
}

/**
 * Kind of a day.
 *
 * @param day the day number.
 * @param calendars production calendars by year; in years without one
 * Saturdays and Sundays are off.
 * @returns working, off or short (shortened working day).
 */
export function dayKind(
  day: number,
  calendars: Partial<Record<number, string>>
): DayKind {
  const year = +dayKeyOf(day).slice(0, 4);
  const digit = calendars[year]?.[day - Date.UTC(year, 0, 1) / DAY];
  if (digit === "1") {
    return "off";
  }
  if (digit === "2") {
    return "short";
  }
  if (digit === "0") {
    return "working";
  }
  return weekdayOf(day) >= 5 ? "off" : "working";
}

const weekdayNames = [
  ["пн", "понедельник", "mon", "monday"],
  ["вт", "вторник", "tue", "tuesday"],
  ["ср", "среда", "wed", "wednesday"],
  ["чт", "четверг", "thu", "thursday"],
  ["пт", "пятница", "fri", "friday"],
  ["сб", "суббота", "sat", "saturday"],
  ["вс", "воскресенье", "sun", "sunday"],
];

/**
 * Day of the week named by an option, e.g. "Пн", "среда" or "Fri".
 *
 * @param name the option name.
 * @returns 0 for Monday … 6 for Sunday, undefined for other names.
 */
export function weekdayIndex(name: string): number | undefined {
  const text = name
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я]/g, "");
  const index = weekdayNames.findIndex((names) => names.includes(text));
  return index < 0 ? undefined : index;
}

/** Whether a select column lists days of the week, e.g. Пн … Пт. */
export const isWeekdayColumn = (column: Column) =>
  column.type === ColumnType.Select &&
  !!column.options?.length &&
  column.options.every((option) => weekdayIndex(option.name) !== undefined);

/** A bar or the weekly marks of a row on a lane. */
export type TimelineItem<R> = {
  row: R;
  /** Line inside the lane, so that items of a lane do not cover each other. */
  level: number;
  /** First and last day shown, inside the range. */
  start: number;
  end: number;
  /** The item begins before / ends after the range. */
  before: boolean;
  after: boolean;
  /** Rows with a day of the week: the marked days. Bars have none. */
  weekly?: number[];
};

export type TimelineLane<R> = {
  /** Value of the lane column; "" for rows without one. */
  key: string;
  label: string;
  items: TimelineItem<R>[];
  /** Number of lines in the lane, at least one. */
  levels: number;
};

export type TimelineLayout<R> = {
  lanes: TimelineLane<R>[];
  /**
   * Days where bars (not weekly marks) of two or more lanes meet, in order,
   * with the labels of these lanes.
   */
  overlaps: Map<number, string[]>;
};

/**
 * Places rows of a timeline view on lanes: a bar from the start to the end
 * date, or a mark on the day of the week every week. Every value of the lane
 * column gets a lane, also when it has nothing in the range.
 *
 * @param columns columns of the database (calculated ones included).
 * @param rows rows of the view, filtered and sorted.
 * @param view the timeline view.
 * @param range the days shown.
 * @param userName resolves user ids for lanes of people columns.
 * @returns the lanes and the overlaps.
 */
export function timelineLayout<R extends Row>(
  columns: Column[],
  rows: R[],
  view: Pick<View, "dateColumn" | "endColumn" | "laneColumn" | "weekdayColumn">,
  range: DayRange,
  userName?: (id: string) => string | undefined
): TimelineLayout<R> {
  const dateColumn = (id?: string) =>
    columns.find((c) => c.id === id && c.type === ColumnType.Date);
  const startColumn = dateColumn(view.dateColumn);
  const endColumn = dateColumn(view.endColumn);
  const weekdayColumn = columns.find(
    (c) => c.id === view.weekdayColumn && c.type === ColumnType.Select
  );
  const laneColumn =
    columns.find((c) => c.id === view.laneColumn) ?? columns[0];
  if (!startColumn || !laneColumn) {
    return { lanes: [], overlaps: new Map() };
  }

  const dayOf = (value: CellValue | undefined) => {
    const key = dateKey(value);
    return key ? dayNumber(key) : undefined;
  };

  const itemOf = (row: R): Omit<TimelineItem<R>, "level"> | undefined => {
    const from = dayOf(row.cells[startColumn.id]);
    const to = endColumn ? dayOf(row.cells[endColumn.id]) : undefined;
    // Reversed dates are swapped.
    const [low, high] =
      from !== undefined && to !== undefined && to < from
        ? [to, from]
        : [from, to];
    const option = weekdayColumn?.options?.find(
      (o) => o.id === row.cells[weekdayColumn.id]
    );
    const weekday = option ? weekdayIndex(option.name) : undefined;

    if (weekday !== undefined) {
      // Every week from the start until the end; empty dates do not limit.
      const first = Math.max(low ?? range.start, range.start);
      const last = Math.min(high ?? range.end, range.end);
      const weekly: number[] = [];
      for (
        let day = first + ((weekday - weekdayOf(first) + 7) % 7);
        day <= last;
        day += 7
      ) {
        weekly.push(day);
      }
      return weekly.length
        ? {
            row,
            start: first,
            end: last,
            before: low === undefined || low < range.start,
            after: high === undefined || high > range.end,
            weekly,
          }
        : undefined;
    }

    if (low === undefined) {
      return undefined;
    }
    // Without an end the bar is one day.
    const end = high ?? low;
    if (end < range.start || low > range.end) {
      return undefined;
    }
    return {
      row,
      start: Math.max(low, range.start),
      end: Math.min(end, range.end),
      before: low < range.start,
      after: end > range.end,
    };
  };

  const lanesOfDay = new Map<number, string[]>();
  const lanes = groupRows(laneColumn, rows, { userName }).map((group) => {
    const items = group.rows
      .map(itemOf)
      .filter((item): item is Omit<TimelineItem<R>, "level"> => !!item)
      .sort((a, b) => a.start - b.start || b.end - a.end);
    // Each item goes to the first line that is free from its start.
    const ends: number[] = [];
    const placed = items.map((item) => {
      let level = ends.findIndex((end) => end < item.start);
      if (level < 0) {
        level = ends.length;
      }
      ends[level] = item.end;
      return { ...item, level };
    });
    const busy = new Set<number>();
    for (const item of placed) {
      if (!item.weekly) {
        for (let day = item.start; day <= item.end; day++) {
          busy.add(day);
        }
      }
    }
    busy.forEach((day) =>
      lanesOfDay.set(day, [...(lanesOfDay.get(day) ?? []), group.label])
    );
    return {
      key: group.key,
      label: group.label,
      items: placed,
      levels: Math.max(1, ends.length),
    };
  });

  const overlaps = new Map(
    [...lanesOfDay]
      .filter(([, labels]) => labels.length > 1)
      .sort(([a], [b]) => a - b)
  );
  return { lanes, overlaps };
}
