import type MarkdownIt from "markdown-it";
import customFence from "markdown-it-container";

/**
 * Columns in markdown, with "%" fences so that they do not collide with
 * notices (":::"):
 *
 *   %%%%columns
 *   %%%column
 *   …
 *   %%%
 *   %%%%
 */
export default function columns(md: MarkdownIt): void {
  customFence(md, "columns", {
    marker: "%",
    validate: (params: string) => params.trim() === "columns",
  });
  customFence(md, "column", {
    marker: "%",
    validate: (params: string) => params.trim() === "column",
  });
}
