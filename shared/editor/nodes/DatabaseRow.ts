import type Token from "markdown-it/lib/token.mjs";
import type { NodeSpec, Node as ProsemirrorNode } from "prosemirror-model";
import { newId } from "../lib/database";
import Node from "./Node";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One row of a database block. Rows are separate nodes so that concurrent
 * edits of different rows merge in collaborative editing.
 */
export default class DatabaseRow extends Node {
  get name() {
    return "database_row";
  }

  get schema(): NodeSpec {
    return {
      attrs: {
        id: { default: null },
        cells: { default: {} },
        docId: { default: null },
      },
      atom: true,
      selectable: false,
      draggable: false,
      parseDOM: [
        {
          tag: "div[data-database-row]",
          getAttrs: (dom: HTMLElement) => {
            try {
              const row = JSON.parse(
                dom.getAttribute("data-database-row") ?? "{}"
              );
              return {
                id: typeof row.id === "string" ? row.id : newId(),
                cells: row.cells && typeof row.cells === "object" ? row.cells : {},
                docId: row.docId ?? null,
              };
            } catch {
              return false;
            }
          },
        },
      ],
      toDOM: (node) => [
        "div",
        { "data-database-row": JSON.stringify(node.attrs) },
      ],
      // Searchable plain text: free-text values, without option and user ids.
      leafText: (node: ProsemirrorNode) =>
        Object.values(node.attrs.cells ?? {})
          .filter(
            (value) =>
              (typeof value === "string" && !UUID.test(value)) ||
              typeof value === "number"
          )
          .join(" "),
    };
  }

  get markdownToken() {
    return "database_row";
  }

  toMarkdown() {
    // Rows are written by the parent database block.
  }

  parseMarkdown() {
    return {
      node: "database_row",
      getAttrs: (token: Token) => ({
        id: token.meta?.id ?? newId(),
        cells: token.meta?.cells ?? {},
        docId: token.meta?.docId ?? null,
      }),
    };
  }
}
