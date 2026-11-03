import { wrapIn } from "prosemirror-commands";
import type {
  NodeSpec,
  NodeType,
  Node as ProsemirrorNode,
} from "prosemirror-model";
import type { Command, EditorState } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";
import { isInTable } from "prosemirror-tables";
import { liftTarget } from "prosemirror-transform";
import type { MarkdownSerializerState } from "../lib/markdown/serializer";
import { isInCode } from "../queries/isInCode";
import { isInList } from "../queries/isInList";
import Node from "./Node";

const maxLevel = 6;

/**
 * Blocks shifted right with Tab. Markdown has no indents, so there the blocks
 * are written as they are.
 */
export default class Indent extends Node {
  get name() {
    return "indent";
  }

  get schema(): NodeSpec {
    return {
      content: "block+",
      group: "block",
      parseDOM: [{ tag: "div.indent" }],
      toDOM: () => ["div", { class: "indent" }, 0],
    };
  }

  commands({ type }: { type: NodeType }) {
    return {
      indent: () => this.indent(type),
      outdent: () => this.outdent(type),
    };
  }

  keys({ type }: { type: NodeType }): Record<string, Command> {
    // Lists, tables, toggles and code take Tab first, their keys come earlier.
    return {
      Tab: this.indent(type),
      "Shift-Tab": this.outdent(type),
      Backspace: (state, dispatch) => {
        const { $cursor } = state.selection as TextSelection;
        if (
          !(state.selection instanceof TextSelection) ||
          !$cursor ||
          $cursor.parentOffset > 0 ||
          $cursor.depth < 2 ||
          $cursor.node(-1).type !== type
        ) {
          return false;
        }
        return this.outdent(type)(state, dispatch);
      },
    };
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
    state.renderContent(node);
  }

  private elsewhere(state: EditorState) {
    return isInList(state) || isInTable(state) || isInCode(state);
  }

  private indent(type: NodeType): Command {
    return (state, dispatch) => {
      const { $from } = state.selection;
      let level = 0;
      for (let d = $from.depth; d > 0; d--) {
        if ($from.node(d).type === type) {
          level++;
        }
      }
      if (this.elsewhere(state) || level >= maxLevel) {
        return false;
      }
      return wrapIn(type)(state, dispatch);
    };
  }

  private outdent(type: NodeType): Command {
    return (state, dispatch) => {
      if (this.elsewhere(state)) {
        return false;
      }
      const { $from, $to } = state.selection;
      const range = $from.blockRange($to, (node) => node.type === type);
      const target = range ? liftTarget(range) : null;
      if (!range || target === null) {
        return false;
      }
      dispatch?.(state.tr.lift(range, target).scrollIntoView());
      return true;
    };
  }
}
