import type Token from "markdown-it/lib/token.mjs";
import type {
  NodeSpec,
  NodeType,
  Node as ProsemirrorNode,
  Schema,
} from "prosemirror-model";
import type { Command } from "prosemirror-state";
import type { DatabaseData, Row } from "../lib/database";
import { newId, normalizeDatabase } from "../lib/database";
import type { MarkdownSerializerState } from "../lib/markdown/serializer";
import databaseRule, { DATABASE_FENCE } from "../rules/database";
import Node from "./Node";

/**
 * Reads the database stored in a node: definition from attrs, rows from the
 * child database_row nodes.
 *
 * @param node a database node.
 * @returns the database data.
 */
export function databaseFromNode(node: ProsemirrorNode): DatabaseData {
  const rows: Row[] = [];
  node.forEach((child) => {
    rows.push({
      id: child.attrs.id,
      cells: child.attrs.cells ?? {},
      ...(child.attrs.docId ? { docId: child.attrs.docId } : {}),
    });
  });
  return {
    title: node.attrs.title ?? "",
    columns: node.attrs.columns ?? [],
    views: node.attrs.views ?? [],
    rows,
  };
}

/**
 * A database block: typed columns, rows and views (table, board, calendar)
 * stored in the document. The editor UI is provided by the app
 * (app/editor/nodes/DatabaseView), the server only needs the schema and
 * markdown.
 */
export default class Database extends Node {
  get name() {
    return "database";
  }

  get schema(): NodeSpec {
    return {
      attrs: {
        id: { default: null },
        title: { default: "" },
        columns: { default: [] },
        views: { default: [] },
      },
      content: "database_row*",
      group: "block",
      atom: true,
      isolating: true,
      defining: true,
      selectable: true,
      draggable: false,
      // Rows, columns and cards are dragged inside the block, which draws
      // its own indicator; the editor's drop cursor would show a second one.
      disableDropCursor: true,
      parseDOM: [
        {
          tag: "div[data-database]",
          getAttrs: (dom: HTMLElement) => {
            try {
              const data = normalizeDatabase(
                JSON.parse(dom.getAttribute("data-database") ?? "{}")
              );
              return {
                id: dom.getAttribute("data-id") || newId(),
                title: data.title,
                columns: data.columns,
                views: data.views,
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
          class: "database",
          "data-id": node.attrs.id,
          "data-database": JSON.stringify({
            title: node.attrs.title,
            columns: node.attrs.columns,
            views: node.attrs.views,
          }),
        },
        0,
      ],
    };
  }

  get rulePlugins() {
    return [databaseRule];
  }

  commands({ type, schema }: { type: NodeType; schema: Schema }) {
    return {
      database:
        (attrs: DatabaseData): Command =>
        (state, dispatch) => {
          const data = normalizeDatabase(attrs);
          const node = type.create(
            {
              id: newId(),
              title: data.title,
              columns: data.columns,
              views: data.views,
            },
            data.rows.map((row) =>
              schema.nodes.database_row.create({
                id: row.id,
                cells: row.cells,
                docId: row.docId ?? null,
              })
            )
          );
          dispatch?.(state.tr.replaceSelectionWith(node).scrollIntoView());
          return true;
        },
    };
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
    const json = JSON.stringify(
      { id: node.attrs.id, ...databaseFromNode(node) },
      null,
      2
    );
    // The fence must be longer than any backtick run in the content.
    const backticks = json.match(/`{3,}/g);
    const fence = "`".repeat(
      backticks ? Math.max(...backticks.map((run) => run.length)) + 1 : 3
    );
    state.ensureNewLine();
    state.write(fence + DATABASE_FENCE + "\n");
    state.text(json, false);
    state.ensureNewLine();
    state.write(fence);
    state.closeBlock(node);
  }

  get markdownToken() {
    return "database";
  }

  parseMarkdown() {
    return {
      block: "database",
      getAttrs: (token: Token) => ({
        id: token.meta?.id ?? newId(),
        title: token.meta?.title ?? "",
        columns: token.meta?.columns ?? [],
        views: token.meta?.views ?? [],
      }),
    };
  }
}
