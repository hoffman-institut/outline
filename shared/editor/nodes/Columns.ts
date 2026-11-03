import type {
  NodeSpec,
  NodeType,
  Node as ProsemirrorNode,
  Schema,
} from "prosemirror-model";
import type { Command } from "prosemirror-state";
import type { MarkdownSerializerState } from "../lib/markdown/serializer";
import columnsRule from "../rules/columns";
import Node from "./Node";

/** A row of two or three columns that hold any blocks. */
export default class Columns extends Node {
  get name() {
    return "columns";
  }

  get schema(): NodeSpec {
    return {
      content: "column{2,3}",
      group: "block",
      defining: true,
      isolating: true,
      parseDOM: [{ tag: "div.columns" }],
      toDOM: (node) => [
        "div",
        {
          class: "columns",
          style: `grid-template-columns: repeat(${node.childCount}, minmax(0, 1fr))`,
        },
        0,
      ],
    };
  }

  get rulePlugins() {
    return [columnsRule];
  }

  commands({ type, schema }: { type: NodeType; schema: Schema }) {
    return {
      columns:
        (attrs?: { count?: number }): Command =>
        (state, dispatch) => {
          const count = attrs?.count === 3 ? 3 : 2;
          const node = type.create(
            null,
            Array.from({ length: count }, () =>
              schema.nodes.column.create(null, schema.nodes.paragraph.create())
            )
          );
          dispatch?.(state.tr.replaceSelectionWith(node).scrollIntoView());
          return true;
        },
    };
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
    state.write("%%%%columns\n");
    state.renderContent(node);
    state.ensureNewLine();
    state.write("%%%%");
    state.closeBlock(node);
  }

  get markdownToken() {
    return "container_columns";
  }

  parseMarkdown() {
    return { block: "columns" };
  }
}

/** One column of a row of columns. */
export class Column extends Node {
  get name() {
    return "column";
  }

  get schema(): NodeSpec {
    return {
      content: "block+",
      isolating: true,
      parseDOM: [{ tag: "div.column" }],
      toDOM: () => ["div", { class: "column" }, 0],
    };
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
    state.write("%%%column\n");
    state.renderContent(node);
    state.ensureNewLine();
    state.write("%%%");
    state.closeBlock(node);
  }

  get markdownToken() {
    return "container_column";
  }

  parseMarkdown() {
    return { block: "column" };
  }
}
