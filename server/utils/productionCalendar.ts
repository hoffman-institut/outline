import {
  parseProductionCalendar,
  weekendCalendar,
} from "@shared/editor/lib/timeline";
import { errToString } from "@shared/utils/error";
import { Day, Minute } from "@shared/utils/time";
import Logger from "@server/logging/Logger";
import { CacheHelper } from "./CacheHelper";
import fetch from "./fetch";

export type ProductionCalendar = {
  year: number;
  /** One digit per day: 0 working, 1 non-working, 2 shortened working day. */
  days: string;
  /** isdayoff: the production calendar of Russia; weekends: only Sat/Sun. */
  source: "isdayoff" | "weekends";
};

/** Fetches the calendar from isdayoff.ru; null when it is not available. */
async function fetchCalendar(year: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://isdayoff.ru/api/getdata?year=${year}&cc=ru&pre=1`,
      // A signal, not `timeout`: it also limits reading the body.
      { signal: AbortSignal.timeout(5000), redirect: "error", size: 64 * 1024 }
    );
    // Unknown years answer 404 with the code "101".
    return res.ok
      ? (parseProductionCalendar(await res.text(), year) ?? null)
      : null;
  } catch (err) {
    Logger.warn("Could not load the production calendar", {
      year,
      error: errToString(err),
    });
    return null;
  }
}

/**
 * Working, non-working and shortened days of a year in Russia, for the
 * timeline view of databases. The calendar of isdayoff.ru is cached for
 * three days; when the service fails the answer has only Saturdays and
 * Sundays off, and the next try is in ten minutes.
 *
 * @param year the year.
 * @returns the days of the year.
 */
export async function productionCalendar(
  year: number
): Promise<ProductionCalendar> {
  const days = await CacheHelper.getDataOrSet<string | null>(
    `production-calendar:ru:${year}`,
    async () => {
      const result = await fetchCalendar(year);
      return result
        ? { data: result, expiry: 3 * Day.seconds }
        : { data: null, expiry: 10 * Minute.seconds };
    },
    3 * Day.seconds
  );
  return days
    ? { year, days, source: "isdayoff" }
    : { year, days: weekendCalendar(year), source: "weekends" };
}
