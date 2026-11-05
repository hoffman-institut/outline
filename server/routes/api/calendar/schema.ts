import { z } from "zod";
import { BaseSchema } from "@server/routes/api/schema";

export const CalendarHolidaysSchema = BaseSchema.extend({
  body: z.object({
    /** The year of the production calendar. */
    year: z.number().int().min(2000).max(2100),
  }),
});

export type CalendarHolidaysReq = z.infer<typeof CalendarHolidaysSchema>;
