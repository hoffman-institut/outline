import type MarkdownIt from "markdown-it";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";

const OPEN = /^\{color:(#[0-9a-fA-F]{6})\}/;
const CLOSE = "{/color}";

/**
 * Colored text in markdown: {color:#e03e3e}text{/color}. The text inside may
 * have other marks.
 */
export default function textColor(md: MarkdownIt): void {
  md.inline.ruler.before(
    "emphasis",
    "text_color",
    (state: StateInline, silent: boolean) => {
      const start = state.pos;
      if (state.src.charCodeAt(start) !== 0x7b /* { */) {
        return false;
      }
      const match = OPEN.exec(state.src.slice(start, state.posMax));
      if (!match) {
        return false;
      }
      const contentStart = start + match[0].length;
      const end = state.src.indexOf(CLOSE, contentStart);
      if (end < 0 || end > state.posMax) {
        return false;
      }
      if (!silent) {
        const open = state.push("text_color_open", "span", 1);
        open.attrs = [["color", match[1]]];
        const max = state.posMax;
        state.pos = contentStart;
        state.posMax = end;
        state.md.inline.tokenize(state);
        state.posMax = max;
        state.push("text_color_close", "span", -1);
      }
      state.pos = end + CLOSE.length;
      return true;
    }
  );
}
