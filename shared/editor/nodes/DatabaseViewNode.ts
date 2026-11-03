import type Token from "markdown-it/lib/token.mjs";
import type {
  NodeSpec,
  NodeType,
  Node as ProsemirrorNode,
} from "prosemirror-model";
import type { Command } from "prosemirror-state";
import type { DatabaseRef, View } from "../lib/database";
import { newId, normalizeDatabase } from "../lib/database";
import type { MarkdownSerializerState } from "../lib/markdown/serializer";
import { DATABASE_VIEW_FENCE } from "../rules/database";
import Node from "./Node";

/** A reference to a database block, or null when it is not valid. */
export function databaseRef(input: unknown): DatabaseRef | null {
  const ref = input as Partial<DatabaseRef> | null;
  return ref &&
    typeof ref.documentId === "string" &&
    typeof ref.databaseId === "string"
    ? { documentId: ref.documentId, databaseId: ref.databaseId }
    : null;
}

/** Views of a linked database, normalized like those of a database. */
const viewsOf = (input: unknown): View[] =>
  Array.isArray(input) && input.length
    ? normalizeDatabase({ views: input }).views
    : [];

/**
 * A linked database: a database block of this or another document shown
 * with its own views (filters, sorting, fields). The data stays in the
 * source block. The editor UI is provided by the app
 * (app/editor/nodes/LinkedDatabaseView).
 */
export default class DatabaseViewNode extends Node {
  get name() {
    return "database_view";
  }

  get schema(): NodeSpec {
    return {
      attrs: {
        id: { default: null },
        /** The source database; null until it is chosen. */
        source: { default: null },
        views: { default: [] },
      },
      group: "block",
      atom: true,
      selectable: true,
      draggable: false,
      disableDropCursor: true,
      parseDOM: [
        {
          tag: "div[data-database-view]",
          getAttrs: (dom: HTMLElement) => {
            try {
              const raw = JSON.parse(
                dom.getAttribute("data-database-view") ?? "{}"
              );
              return {
                id: dom.getAttribute("data-id") || newId(),
                source: databaseRef(raw.source),
                views: viewsOf(raw.views),
              };
            } catch {
              return false;
            }
          },
        },
      ],
      toDOM: (node) => [
        "div",
        {
          class: "database-view",
          "data-id": node.attrs.id,
          "data-database-view": JSON.stringify({
            source: node.attrs.source,
            views: node.attrs.views,
          }),
        },
      ],
    };
  }

  commands({ type }: { type: NodeType }) {
    return {
      database_view: (): Command => (state, dispatch) => {
        dispatch?.(
          state.tr
            .replaceSelectionWith(
              type.create({ id: newId(), source: null, views: [] })
            )
            .scrollIntoView()
        );
        return true;
      },
    };
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
    const json = JSON.stringify(
      { id: node.attrs.id, source: node.attrs.source, views: node.attrs.views },
      null,
      2
    );
    // The fence must be longer than any backtick run in the content.
    const backticks = json.match(/`{3,}/g);
    const fence = "`".repeat(
      backticks ? Math.max(...backticks.map((run) => run.length)) + 1 : 3
    );
    state.ensureNewLine();
    state.write(fence + DATABASE_VIEW_FENCE + "\n");
    state.text(json, false);
    state.ensureNewLine();
    state.write(fence);
    state.closeBlock(node);
  }

  parseMarkdown() {
    return {
      node: "database_view",
      getAttrs: (token: Token) => ({
        id: token.meta?.id ?? newId(),
        source: databaseRef(token.meta?.source),
        views: viewsOf(token.meta?.views),
      }),
    };
  }
}
