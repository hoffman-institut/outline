import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import AuthenticationHelper from "@shared/helpers/AuthenticationHelper";
import { Document } from "@server/models";
import { authorize } from "@server/policies";
import {
  addDatabaseRow,
  columnFor,
  deleteDatabaseRow,
  plainRows,
  readDatabases,
  updateDatabaseRow,
} from "@server/utils/databaseRows";
import {
  buildAPIContext,
  error,
  getActorFromContext,
  optionalString,
  success,
  withTracing,
} from "../util";

const values = z
  .record(z.string(), z.unknown())
  .describe(
    "Values by column name (or id). Select options by name, dates as YYYY-MM-DD, checkboxes as true/false, people and relations as lists of ids. Calculated columns (formula, rollup, backlink, auto number) are ignored."
  );

/**
 * Registers tools for the database blocks of documents: read rows and add,
 * change or delete them without rewriting the document, which is safe while
 * people edit it.
 *
 * @param server - the MCP server instance to register tools on.
 * @param scopes - the OAuth scopes granted to the access token.
 */
export function databaseTools(server: McpServer, scopes: string[]) {
  // Documents may be given by id or url id, changes need the id.
  const resolve = async (
    extra: Parameters<typeof getActorFromContext>[0],
    documentId: string
  ) => {
    const user = getActorFromContext(extra);
    const document = await Document.findByPk(documentId, { userId: user.id });
    authorize(user, "read", document);
    return { user, id: document!.id };
  };

  if (AuthenticationHelper.canAccess("documents.info", scopes)) {
    server.registerTool(
      "list_databases",
      {
        title: "List databases",
        description:
          "Lists the database blocks of a document with their columns (names, types, options) and views. Use it before reading or changing rows.",
        annotations: { idempotentHint: true, readOnlyHint: true },
        inputSchema: {
          documentId: z.string().describe("The document id or url id."),
        },
      },
      withTracing("list_databases", async ({ documentId }, extra) => {
        try {
          const { user, id } = await resolve(extra, documentId);
          const databases = await readDatabases(user, id);
          return success(
            databases.map(({ db }) => ({
              id: db.id,
              documentId: id,
              title: db.title,
              rowCount: db.rows.length,
              columns: db.columns.map((c) => ({
                id: c.id,
                name: c.name,
                type: c.type,
                ...(c.options ? { options: c.options.map((o) => o.name) } : {}),
                ...(c.formula ? { formula: c.formula } : {}),
              })),
              views: db.views.map((v) => ({
                id: v.id,
                name: v.name,
                type: v.type,
              })),
            }))
          );
        } catch (err) {
          return error(err);
        }
      })
    );

    server.registerTool(
      "query_database",
      {
        title: "Query database",
        description:
          "Reads the rows of a database block as objects keyed by column name, with values as people see them (option names, dates DD.MM.YYYY, linked row titles, formula and rollup results). Each row has its id for update_database_row.",
        annotations: { idempotentHint: true, readOnlyHint: true },
        inputSchema: {
          documentId: z.string().describe("The document id or url id."),
          databaseId: z.string().describe("The database block id."),
          search: optionalString().describe(
            "Text to find in any column, any case."
          ),
          where: z
            .record(z.string(), z.string())
            .optional()
            .describe(
              "Rows whose column (by name) contains the text, any case."
            ),
          offset: z.coerce.number().int().min(0).optional(),
          limit: z.coerce.number().int().min(1).max(500).optional(),
        },
      },
      withTracing(
        "query_database",
        async (
          { documentId, databaseId, search, where, offset, limit },
          extra
        ) => {
          try {
            const { user, id } = await resolve(extra, documentId);
            const found = (await readDatabases(user, id)).find(
              ({ db }) => db.id === databaseId
            );
            if (!found) {
              return error("Database not found in the document");
            }
            const needle = search?.trim().toLowerCase();
            const rows = plainRows(found.computed).filter((row) => {
              const text = (value: unknown) =>
                (Array.isArray(value)
                  ? value.join(" ")
                  : String(value ?? "")
                ).toLowerCase();
              if (
                needle &&
                !Object.values(row).some((value) =>
                  text(value).includes(needle)
                )
              ) {
                return false;
              }
              return Object.entries(where ?? {}).every(([key, expected]) => {
                const column = columnFor(found.db.columns, key);
                return column
                  ? text(row[column.name]).includes(expected.toLowerCase())
                  : true;
              });
            });
            const start = offset ?? 0;
            return success({
              total: rows.length,
              rows: rows.slice(start, start + (limit ?? 100)),
            });
          } catch (err) {
            return error(err);
          }
        }
      )
    );
  }

  if (AuthenticationHelper.canAccess("databases.addRow", scopes)) {
    server.registerTool(
      "add_database_row",
      {
        title: "Add database row",
        description:
          "Adds a row to a database block. The change merges with edits of people who have the document open. Readers can add rows only to databases with a form view.",
        inputSchema: {
          documentId: z.string().describe("The document id or url id."),
          databaseId: z.string().describe("The database block id."),
          values,
        },
      },
      withTracing(
        "add_database_row",
        async ({ documentId, databaseId, values: input }, extra) => {
          try {
            const { user, id } = await resolve(extra, documentId);
            const rowId = await addDatabaseRow(
              user,
              buildAPIContext(extra).context,
              { documentId: id, databaseId },
              input
            );
            return success({ rowId });
          } catch (err) {
            return error(err);
          }
        }
      )
    );
  }

  if (AuthenticationHelper.canAccess("databases.updateRow", scopes)) {
    server.registerTool(
      "update_database_row",
      {
        title: "Update database row",
        description:
          "Changes values of a row of a database block; other columns keep their values.",
        inputSchema: {
          documentId: z.string().describe("The document id or url id."),
          databaseId: z.string().describe("The database block id."),
          rowId: z.string().describe("The row id from query_database."),
          values,
        },
      },
      withTracing(
        "update_database_row",
        async ({ documentId, databaseId, rowId, values: input }, extra) => {
          try {
            const { user, id } = await resolve(extra, documentId);
            await updateDatabaseRow(
              user,
              buildAPIContext(extra).context,
              { documentId: id, databaseId },
              rowId,
              input
            );
            return success({ rowId });
          } catch (err) {
            return error(err);
          }
        }
      )
    );
  }

  if (AuthenticationHelper.canAccess("databases.deleteRow", scopes)) {
    server.registerTool(
      "delete_database_row",
      {
        title: "Delete database row",
        description: "Deletes a row of a database block.",
        annotations: { destructiveHint: true },
        inputSchema: {
          documentId: z.string().describe("The document id or url id."),
          databaseId: z.string().describe("The database block id."),
          rowId: z.string().describe("The row id from query_database."),
        },
      },
      withTracing(
        "delete_database_row",
        async ({ documentId, databaseId, rowId }, extra) => {
          try {
            const { user, id } = await resolve(extra, documentId);
            await deleteDatabaseRow(
              user,
              buildAPIContext(extra).context,
              { documentId: id, databaseId },
              rowId
            );
            return success({ rowId });
          } catch (err) {
            return error(err);
          }
        }
      )
    );
  }
}
