import type Token from "markdown-it/lib/token.mjs";
import type { MarkSpec, Mark as ProsemirrorMark } from "prosemirror-model";
import { validateColorHex } from "@shared/utils/color";
import textColorRule from "../rules/textColor";
import Mark from "./Mark";

/** Text colors offered in the toolbar, readable on light and dark themes. */
export const textColors = [
  { hex: "#E03E3E", name: "Red" },
  { hex: "#D9730D", name: "Orange" },
  { hex: "#B7950B", name: "Yellow" },
  { hex: "#2E9E5B", name: "Green" },
  { hex: "#2F6FDB", name: "Blue" },
  { hex: "#8E44AD", name: "Purple" },
  { hex: "#8A8F98", name: "Gray" },
];

/** Colored text. */
export default class TextColor extends Mark {
  get name() {
    return "text_color";
  }

  get schema(): MarkSpec {
    return {
      attrs: {
        color: { default: null, validate: "string|null" },
      },
      excludes: "text_color",
      parseDOM: [
        {
          tag: "span[data-text-color]",
          getAttrs: (dom: HTMLElement) => {
            const color = dom.getAttribute("data-text-color") || "";
            return validateColorHex(color) ? { color } : false;
          },
        },
      ],
      toDOM: (mark: ProsemirrorMark) => [
        "span",
        {
          "data-text-color": mark.attrs.color,
          style: `color: ${mark.attrs.color}`,
        },
      ],
    };
  }

  get rulePlugins() {
    return [textColorRule];
  }

  toMarkdown() {
    return {
      open: (_state: unknown, mark: ProsemirrorMark) =>
        `{color:${mark.attrs.color}}`,
      close: "{/color}",
      mixable: true,
      expelEnclosingWhitespace: true,
    };
  }

  parseMarkdown() {
    return {
      mark: "text_color",
      getAttrs: (token: Token) => ({ color: token.attrGet("color") }),
    };
  }
}
