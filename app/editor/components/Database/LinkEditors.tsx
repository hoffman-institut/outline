import * as React from "react";
import { useTranslation } from "react-i18next";
import type {
  Column,
  DatabaseData,
  DatabaseRef,
  RollupFunction,
} from "@shared/editor/lib/database";
import { ColumnType, totalsFor } from "@shared/editor/lib/database";
import { computeDatabase } from "@shared/editor/lib/databaseCompute";
import { client } from "~/utils/ApiClient";
import {
  MenuLabel,
  MenuRow,
  Select,
  TextInput,
  useTotalLabels,
} from "./components";
import { useDatabase } from "./context";
import { databasesInDoc, loadDocument } from "./linked";

const sameRef = (a?: DatabaseRef, b?: DatabaseRef) =>
  !!a && !!b && a.documentId === b.documentId && a.databaseId === b.databaseId;

/** Finds a database by reference in this document or a loaded one. */
function useFindDatabase() {
  const { editorView, documentId, linked } = useDatabase();
  return (ref?: DatabaseRef): DatabaseData | undefined => {
    if (!ref) {
      return undefined;
    }
    return ref.documentId === documentId
      ? databasesInDoc(editorView.state.doc).get(ref.databaseId)
      : linked.document(ref.documentId)?.databases.get(ref.databaseId);
  };
}

/**
 * Chooses a database: one of this document or of another document found by
 * its title.
 */
function DatabasePicker({
  value,
  onChange,
}: {
  value?: DatabaseRef;
  onChange: (ref: DatabaseRef) => void;
}) {
  const { t } = useTranslation();
  const { editorView, documentId, databaseId, linked } = useDatabase();
  const [query, setQuery] = React.useState("");
  const [found, setFound] = React.useState<{ id: string; title: string }[]>([]);
  const [otherId, setOtherId] = React.useState(
    value && value.documentId !== documentId ? value.documentId : undefined
  );
  const local = [...databasesInDoc(editorView.state.doc).values()];
  const other = otherId ? linked.document(otherId) : undefined;
  const nameOf = (db: DatabaseData) => db.title || t("Untitled database");

  React.useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setFound([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      client
        .post("/documents.search_titles", { query: trimmed, limit: 8 })
        .then((res) => {
          if (!cancelled) {
            setFound(
              res.data.map((doc: { id: string; title: string }) => ({
                id: doc.id,
                title: doc.title,
              }))
            );
          }
        })
        .catch(() => undefined);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  React.useEffect(() => {
    if (otherId) {
      loadDocument(otherId);
    }
  }, [otherId]);

  return (
    <>
      {documentId && (
        <>
          <MenuLabel>{t("In this document")}</MenuLabel>
          {local.map((db) => {
            const ref = { documentId, databaseId: db.id };
            return (
              <MenuRow
                key={db.id}
                type="button"
                $active={sameRef(ref, value)}
                onClick={() => onChange(ref)}
              >
                {nameOf(db)}
                {db.id === databaseId && ` (${t("this database")})`}
              </MenuRow>
            );
          })}
        </>
      )}
      <MenuLabel>{t("In another document")}</MenuLabel>
      <TextInput
        placeholder={t("Find a document")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {found
        .filter((doc) => doc.id !== documentId)
        .map((doc) => (
          <MenuRow
            key={doc.id}
            type="button"
            $active={doc.id === otherId}
            onClick={() => setOtherId(doc.id)}
          >
            {doc.title || t("Untitled")}
          </MenuRow>
        ))}
      {otherId &&
        (other ? (
          <>
            <MenuLabel>{other.title || t("Untitled")}</MenuLabel>
            {[...other.databases.values()].map((db) => {
              const ref = { documentId: otherId, databaseId: db.id };
              return (
                <MenuRow
                  key={db.id}
                  type="button"
                  $active={sameRef(ref, value)}
                  onClick={() => onChange(ref)}
                >
                  {nameOf(db)}
                </MenuRow>
              );
            })}
            {other.databases.size === 0 && (
              <MenuLabel>{t("No databases in this document")}</MenuLabel>
            )}
          </>
        ) : (
          <MenuLabel>
            {linked.status(otherId) === "error"
              ? t("No access to the linked database")
              : t("Loading…")}
          </MenuLabel>
        ))}
    </>
  );
}

/** Linked database of a relation column. */
export function RelationEditor({ column }: { column: Column }) {
  const { t } = useTranslation();
  const { data, mutator } = useDatabase();
  const findDatabase = useFindDatabase();
  const target = findDatabase(column.relation);

  return (
    <>
      <MenuLabel>
        {t("Linked database")}:{" "}
        {column.relation
          ? target?.title || t("Untitled database")
          : t("not chosen")}
      </MenuLabel>
      <DatabasePicker
        value={column.relation}
        onChange={(relation) => {
          if (sameRef(relation, column.relation)) {
            return;
          }
          // Row ids of another database mean nothing in the new one.
          mutator.setColumns(
            data.columns.map((c) =>
              c.id === column.id ? { ...c, relation } : c
            ),
            (cells) => ({ ...cells, [column.id]: [] })
          );
        }}
      />
    </>
  );
}

/** Database and relation column whose links a backlink column shows. */
export function BacklinkEditor({ column }: { column: Column }) {
  const { t } = useTranslation();
  const { data, mutator, documentId, databaseId } = useDatabase();
  const findDatabase = useFindDatabase();
  const [source, setSource] = React.useState<DatabaseRef | undefined>(
    column.relation
  );
  const sourceData = findDatabase(source);
  // Relations of that database that link to this one.
  const relations = (sourceData?.columns ?? []).filter(
    (c) =>
      c.type === ColumnType.Relation &&
      c.relation?.databaseId === databaseId &&
      c.relation?.documentId === documentId
  );

  const save = (columnId: string) =>
    source &&
    mutator.setColumns(
      data.columns.map((c) =>
        c.id === column.id ? { ...c, relation: { ...source, columnId } } : c
      )
    );

  return (
    <>
      <DatabasePicker value={source} onChange={setSource} />
      {source && sourceData && (
        <>
          <MenuLabel>{t("Relation that links here")}</MenuLabel>
          {relations.map((relation) => (
            <MenuRow
              key={relation.id}
              type="button"
              $active={
                sameRef(source, column.relation) &&
                column.relation?.columnId === relation.id
              }
              onClick={() => save(relation.id)}
            >
              {relation.name}
            </MenuRow>
          ))}
          {relations.length === 0 && (
            <MenuLabel>
              {t("That database has no relations to this one")}
            </MenuLabel>
          )}
        </>
      )}
    </>
  );
}

/** Relation, column and calculation of a rollup column. */
export function RollupEditor({ column }: { column: Column }) {
  const { t } = useTranslation();
  const { data, mutator, linked } = useDatabase();
  const labels = useTotalLabels();
  const links = data.columns.filter(
    (c) =>
      (c.type === ColumnType.Relation || c.type === ColumnType.Backlink) &&
      c.relation
  );
  const spec = column.rollup;
  const via = links.find((c) => c.id === spec?.columnId);
  const target = via?.relation ? linked.get(via.relation) : undefined;
  const targetColumns = target ? computeDatabase(target).columns : [];
  const targetColumn = targetColumns.find((c) => c.id === spec?.targetColumnId);
  const functions: RollupFunction[] = targetColumn
    ? [...totalsFor(targetColumn.type), "values"]
    : [];

  const save = (patch: Partial<NonNullable<Column["rollup"]>>) => {
    const next = {
      columnId: spec?.columnId ?? "",
      targetColumnId: spec?.targetColumnId ?? "",
      fn: spec?.fn ?? ("count" as RollupFunction),
      ...patch,
    };
    mutator.setColumns(
      data.columns.map((c) => (c.id === column.id ? { ...c, rollup: next } : c))
    );
  };

  if (!links.length) {
    return <MenuLabel>{t("Add a relation column first")}</MenuLabel>;
  }

  return (
    <>
      <MenuLabel>{t("Through relation")}</MenuLabel>
      <Select
        value={via?.id ?? ""}
        onChange={(event) =>
          save({ columnId: event.target.value, targetColumnId: "" })
        }
      >
        <option value="" disabled>
          {t("Choose…")}
        </option>
        {links.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      {via && (
        <>
          <MenuLabel>{t("Column of the linked database")}</MenuLabel>
          <Select
            value={targetColumn?.id ?? ""}
            onChange={(event) => {
              const next = targetColumns.find(
                (c) => c.id === event.target.value
              );
              const allowed = next ? [...totalsFor(next.type), "values"] : [];
              save({
                targetColumnId: event.target.value,
                ...(spec?.fn && allowed.includes(spec.fn)
                  ? {}
                  : { fn: "count" as RollupFunction }),
              });
            }}
          >
            <option value="" disabled>
              {target ? t("Choose…") : t("Loading…")}
            </option>
            {targetColumns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </>
      )}
      {targetColumn && (
        <>
          <MenuLabel>{t("Calculate")}</MenuLabel>
          <Select
            value={spec?.fn ?? "count"}
            onChange={(event) =>
              save({ fn: event.target.value as RollupFunction })
            }
          >
            {functions.map((fn) => (
              <option key={fn} value={fn}>
                {fn === "values" ? t("Show values") : labels[fn]}
              </option>
            ))}
          </Select>
        </>
      )}
    </>
  );
}
