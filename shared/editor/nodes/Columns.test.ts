import { EditorState, TextSelection } from "prosemirror-state";
import { parser, schema, serializer } from "../../test/editor";
import Columns from "./Columns";
import Indent from "./Indent";

const p = (text: string) =>
  schema.nodes.paragraph.create(null, schema.text(text));

describe("Columns markdown", () => {
  it("survives a markdown round trip", () => {
    const doc = schema.nodes.doc.create(null, [
      p("Перед"),
      schema.nodes.columns.create(null, [
        schema.nodes.column.create(null, [p("Левая"), p("Ещё левая")]),
        schema.nodes.column.create(null, [p("Средняя")]),
        schema.nodes.column.create(null, [
          schema.nodes.heading.create({ level: 2 }, schema.text("Правая")),
        ]),
      ]),
      p("После"),
    ]);
    const markdown = serializer.serialize(doc);
    expect(markdown).toContain("%%%%columns");
    expect(markdown).toContain("%%%column");

    const parsed = parser.parse(markdown);
    const columns = parsed.child(1);
    expect(columns.type.name).toBe("columns");
    expect(columns.childCount).toBe(3);
    expect(columns.child(0).childCount).toBe(2);
    expect(columns.child(0).child(1).textContent).toBe("Ещё левая");
    expect(columns.child(2).child(0).type.name).toBe("heading");
    expect(parsed.child(2).textContent).toBe("После");
  });

  it("inserts empty columns with the command", () => {
    const { columns } = new Columns().commands({
      type: schema.nodes.columns,
      schema,
    });
    const doc = schema.nodes.doc.create(null, [p("Текст")]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.atEnd(doc),
    });
    let next = state;
    columns({ count: 3 })(state, (tr) => {
      next = state.apply(tr);
    });
    const node = next.doc.child(1);
    expect(node.type.name).toBe("columns");
    expect(node.childCount).toBe(3);
    expect(node.child(2).child(0).type.name).toBe("paragraph");
  });
});

describe("Text color markdown", () => {
  it("survives a markdown round trip", () => {
    const color = schema.marks.text_color.create({ color: "#E03E3E" });
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.text("Обычный "),
        schema.text("красный", [color]),
        schema.text(" и "),
        schema.text("жирный красный", [color, schema.marks.strong.create()]),
      ]),
    ]);
    const markdown = serializer.serialize(doc);
    expect(markdown).toContain("{color:#E03E3E}красный{/color}");

    const parsed = parser.parse(markdown);
    const paragraph = parsed.child(0);
    expect(paragraph.textContent).toBe("Обычный красный и жирный красный");
    const colored: string[] = [];
    paragraph.forEach((node) => {
      if (node.marks.some((m) => m.type.name === "text_color")) {
        colored.push(node.text ?? "");
      }
    });
    expect(colored.join("")).toBe("красныйжирный красный");
    let strong = false;
    paragraph.forEach((node) => {
      if (
        node.text === "жирный красный" &&
        node.marks.some((m) => m.type.name === "strong")
      ) {
        strong = true;
      }
    });
    expect(strong).toBe(true);
  });

  it("leaves an unknown color as text", () => {
    const parsed = parser.parse("{color:red}текст{/color}");
    expect(parsed.textContent).toBe("{color:red}текст{/color}");
  });
});

describe("Indent", () => {
  const keys = new Indent().keys({ type: schema.nodes.indent });
  const at = (doc: ReturnType<typeof schema.node>, pos: number) => {
    const state = EditorState.create({ doc });
    return state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, pos))
    );
  };
  const run = (state: EditorState, key: string) => {
    let next: EditorState | undefined;
    const handled = keys[key](state, (tr) => {
      next = state.apply(tr);
    });
    return { handled, next };
  };

  it("indents and outdents a paragraph", () => {
    const doc = schema.nodes.doc.create(null, [p("Первый"), p("Второй")]);
    const tab = run(at(doc, 10), "Tab");
    expect(tab.handled).toBe(true);
    expect(tab.next!.doc.child(1).type.name).toBe("indent");
    expect(tab.next!.doc.child(1).textContent).toBe("Второй");

    const twice = run(tab.next!, "Tab");
    expect(twice.next!.doc.child(1).child(0).type.name).toBe("indent");

    const back = run(twice.next!, "Shift-Tab");
    expect(back.next!.doc.child(1).type.name).toBe("indent");
    expect(back.next!.doc.child(1).child(0).type.name).toBe("paragraph");
  });

  it("outdents with backspace at the start of a line", () => {
    const doc = schema.nodes.doc.create(null, [
      p("Первый"),
      schema.nodes.indent.create(null, [p("Второй")]),
    ]);
    // Start of "Второй": 8 for the first paragraph, 1 into indent, 1 into it.
    const result = run(at(doc, 10), "Backspace");
    expect(result.handled).toBe(true);
    expect(result.next!.doc.child(1).type.name).toBe("paragraph");

    const inside = run(at(doc, 11), "Backspace");
    expect(inside.handled).toBe(false);
  });

  it("leaves Tab in lists alone", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.bullet_list.create(null, [
        schema.nodes.list_item.create(null, [p("Пункт")]),
      ]),
    ]);
    expect(run(at(doc, 3), "Tab").handled).toBe(false);
  });

  it("writes indented blocks to markdown as they are", () => {
    const doc = schema.nodes.doc.create(null, [
      p("Первый"),
      schema.nodes.indent.create(null, [p("Второй")]),
    ]);
    const markdown = serializer.serialize(doc);
    expect(markdown.trim()).toBe("Первый\n\nВторой");
  });
});
