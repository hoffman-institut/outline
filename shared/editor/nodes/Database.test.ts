import { parser, schema, serializer } from "../../test/editor";
import { ColumnType, ViewType } from "../lib/database";
import { databaseFromNode } from "./Database";

const columns = [
  { id: "name", name: "Имя", type: ColumnType.Text },
  {
    id: "dept",
    name: "Отдел",
    type: ColumnType.Select,
    options: [{ id: "adm", name: "Административный отдел", color: "blue" }],
  },
  { id: "bd", name: "День рождения", type: ColumnType.Date },
];
const views = [
  {
    id: "v1",
    name: "Таблица",
    type: ViewType.Table,
    sort: [{ columnId: "bd", direction: "asc", upcoming: true }],
    filters: [],
    hidden: [],
  },
];

function buildDoc() {
  return schema.nodes.doc.create(null, [
    schema.nodes.paragraph.create(null, schema.text("Перед базой")),
    schema.nodes.database.create(
      { id: "db1", title: "Сотрудники", columns, views },
      [
        schema.nodes.database_row.create({
          id: "r1",
          cells: { name: "Анна ```", dept: "adm", bd: "1990-11-10" },
        }),
        schema.nodes.database_row.create({
          id: "r2",
          cells: { name: "Борис" },
        }),
      ]
    ),
    schema.nodes.paragraph.create(null, schema.text("После базы")),
  ]);
}

describe("Database markdown", () => {
  it("survives a markdown round trip", () => {
    const doc = buildDoc();
    const markdown = serializer.serialize(doc);
    // The cell contains ``` so the fence grows to four backticks.
    expect(markdown).toContain("````hoffman-database");

    const parsed = parser.parse(markdown);
    const database = parsed.child(1);
    expect(database.type.name).toBe("database");
    expect(database.attrs.id).toBe("db1");
    expect(databaseFromNode(database)).toEqual(databaseFromNode(doc.child(1)));
    expect(parsed.child(2).textContent).toBe("После базы");
  });

  it("keeps invalid JSON as a code block", () => {
    const parsed = parser.parse("```hoffman-database\nnot json\n```");
    expect(parsed.child(0).type.name).not.toBe("database");
  });

  it("puts row values into the plain text", () => {
    const doc = buildDoc();
    const text = doc.textBetween(0, doc.content.size, "\n", (node) =>
      node.type.spec.leafText ? node.type.spec.leafText(node) : ""
    );
    expect(text).toContain("Борис");
    expect(text).toContain("1990-11-10");
  });
});

describe("Linked database markdown", () => {
  it("survives a markdown round trip with its own views", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.database_view.create({
        id: "lv1",
        source: { documentId: "doc-1", databaseId: "db1" },
        views,
      }),
      schema.nodes.paragraph.create(null, schema.text("После")),
    ]);
    const markdown = serializer.serialize(doc);
    expect(markdown).toContain("```hoffman-database-view");

    const parsed = parser.parse(markdown);
    const linked = parsed.child(0);
    expect(linked.type.name).toBe("database_view");
    expect(linked.attrs.id).toBe("lv1");
    expect(linked.attrs.source).toEqual({
      documentId: "doc-1",
      databaseId: "db1",
    });
    expect(linked.attrs.views[0].sort).toEqual(views[0].sort);
    expect(parsed.child(1).textContent).toBe("После");
  });

  it("keeps a block without a source", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.database_view.create({ id: "lv2", source: null, views: [] }),
    ]);
    const parsed = parser.parse(serializer.serialize(doc));
    expect(parsed.child(0).type.name).toBe("database_view");
    expect(parsed.child(0).attrs.source).toBeNull();
  });
});
