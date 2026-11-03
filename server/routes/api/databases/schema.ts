import { z } from "zod";
import { BaseSchema } from "@server/routes/api/schema";

const Cells = z.record(z.string(), z.unknown());

export const DatabasesAddRowSchema = BaseSchema.extend({
  body: z.object({
    /** Document that holds the database block. */
    documentId: z.uuid(),
    /** Id of the database block. */
    databaseId: z.string().min(1),
    /** Values by column id; select options may be given by name. */
    cells: Cells.optional(),
  }),
});

export type DatabasesAddRowReq = z.infer<typeof DatabasesAddRowSchema>;

export const DatabasesUpdateRowSchema = BaseSchema.extend({
  body: z.object({
    documentId: z.uuid(),
    databaseId: z.string().min(1),
    rowId: z.string().min(1),
    /** Changed values by column id. */
    cells: Cells,
  }),
});

export type DatabasesUpdateRowReq = z.infer<typeof DatabasesUpdateRowSchema>;
