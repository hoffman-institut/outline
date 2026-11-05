import Router from "@koa/router";
import auth from "@server/middlewares/authentication";
import { rateLimiter } from "@server/middlewares/rateLimiter";
import validate from "@server/middlewares/validate";
import type { APIContext } from "@server/types";
import { RateLimiterStrategy } from "@server/utils/RateLimiter";
import { productionCalendar } from "@server/utils/productionCalendar";
import * as T from "./schema";

const router = new Router();

/**
 * Non-working and shortened days of a year in Russia (the timeline view of
 * databases shades them). Only signed in users may ask, so that the service
 * is not called for strangers.
 */
router.post(
  "calendar.holidays",
  rateLimiter(RateLimiterStrategy.OneHundredPerMinute),
  auth(),
  validate(T.CalendarHolidaysSchema),
  async (ctx: APIContext<T.CalendarHolidaysReq>) => {
    ctx.body = { data: await productionCalendar(ctx.input.body.year) };
  }
);

export default router;
