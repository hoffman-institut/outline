import Router from "@koa/router";
import auth from "@server/middlewares/authentication";
import { rateLimiter } from "@server/middlewares/rateLimiter";
import validate from "@server/middlewares/validate";
import type { APIContext } from "@server/types";
import { RateLimiterStrategy } from "@server/utils/RateLimiter";
import {
  addDatabaseRow,
  deleteDatabaseRow,
  updateDatabaseRow,
} from "@server/utils/databaseRows";
import * as T from "./schema";

/**
 * Rows of database blocks changed through the API: forms, rows created from
 * a relation in another document, linked databases, automations. See
 * server/utils/databaseRows.
 */
const router = new Router();

router.post(
  "databases.addRow",
  rateLimiter(RateLimiterStrategy.OneHundredPerMinute),
  auth(),
  validate(T.DatabasesAddRowSchema),
  async (ctx: APIContext<T.DatabasesAddRowReq>) => {
    const { documentId, databaseId, cells, rowId } = ctx.input.body;
    const id = await addDatabaseRow(
      ctx.state.auth.user,
      ctx.context,
      { documentId, databaseId },
      cells,
      rowId
    );
    ctx.body = { data: { rowId: id } };
  }
);

router.post(
  "databases.updateRow",
  rateLimiter(RateLimiterStrategy.OneHundredPerMinute),
  auth(),
  validate(T.DatabasesUpdateRowSchema),
  async (ctx: APIContext<T.DatabasesUpdateRowReq>) => {
    const { documentId, databaseId, rowId, cells } = ctx.input.body;
    await updateDatabaseRow(
      ctx.state.auth.user,
      ctx.context,
      { documentId, databaseId },
      rowId,
      cells
    );
    ctx.body = { data: { rowId } };
  }
);

router.post(
  "databases.deleteRow",
  rateLimiter(RateLimiterStrategy.OneHundredPerMinute),
  auth(),
  validate(T.DatabasesDeleteRowSchema),
  async (ctx: APIContext<T.DatabasesDeleteRowReq>) => {
    const { documentId, databaseId, rowId } = ctx.input.body;
    await deleteDatabaseRow(
      ctx.state.auth.user,
      ctx.context,
      { documentId, databaseId },
      rowId
    );
    ctx.body = { success: true };
  }
);

export default router;
