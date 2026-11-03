import type MarkdownIt from "markdown-it";
import { newId, normalizeDatabase } from "../lib/database";

/** Info string of the fenced block that stores a database in markdown. */
export const DATABASE_FENCE = "hoffman-database";

/** Info string of the fenced block of a linked database (its own views). */
export const DATABASE_VIEW_FENCE = "hoffman-database-view";

/**
 * Turns ```hoffman-database fences (JSON) into database_open / database_row /
 * database_close tokens, so that markdown from the API, MCP or imports
 * restores the database block instead of a code block.
 */
export default function database(md: MarkdownIt): void {
  md.core.ruler.after("block", "database", (state) => {
    const tokens = state.tokens;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const fence = tokens[i];
      if (fence.type !== "fence") {
        continue;
      }
      if (fence.info.trim() === DATABASE_VIEW_FENCE) {
        try {
          const token = new state.Token("database_view", "div", 0);
          token.block = true;
          token.map = fence.map;
          token.meta = JSON.parse(fence.content);
          tokens.splice(i, 1, token);
        } catch {
          // Not valid JSON: keep it as a regular code block.
        }
        continue;
      }
      if (fence.info.trim() !== DATABASE_FENCE) {
        continue;
      }

      let raw: { id?: unknown };
      try {
        raw = JSON.parse(fence.content);
      } catch {
        // Not valid JSON: keep it as a regular code block.
        continue;
      }
      const data = normalizeDatabase(raw);

      const open = new state.Token("database_open", "div", 1);
      open.block = true;
      open.map = fence.map;
      open.meta = {
        id: typeof raw.id === "string" ? raw.id : newId(),
        title: data.title,
        columns: data.columns,
        views: data.views,
        templates: data.templates ?? [],
      };

      const rows = data.rows.map((row) => {
        const token = new state.Token("database_row", "div", 0);
        token.block = true;
        token.meta = row;
        return token;
      });

      const close = new state.Token("database_close", "div", -1);
      close.block = true;

      tokens.splice(i, 1, open, ...rows, close);
    }
    return false;
  });
}
