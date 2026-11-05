import { observer } from "mobx-react";
import * as React from "react";
import styled, { css } from "styled-components";
import type { EditorView } from "prosemirror-view";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type {
  CellValue,
  Column,
  DatabaseData,
  DatabaseRef,
  RowTemplate,
  SelectOption,
  View,
} from "@shared/editor/lib/database";
import {
  ViewType,
  cellsForFilters,
  displayValue,
  newId,
  nextOptionColor,
  normalizeDatabase,
  rowsForView,
} from "@shared/editor/lib/database";
import {
  computeDatabase,
  rowMatches,
} from "@shared/editor/lib/databaseCompute";
import { databaseFromNode } from "@shared/editor/nodes/Database";
import type { ComponentProps } from "@shared/editor/types";
import { s } from "@shared/styles";
import { useDocumentContext } from "~/components/DocumentContext";
import useStores from "~/hooks/useStores";
import { client } from "~/utils/ApiClient";
import { BoardView } from "./BoardView";
import { CalendarView } from "./CalendarView";
import { FormView } from "./FormView";
import { GalleryView } from "./GalleryView";
import { RowPanel } from "./RowPanel";
import { TableView } from "./TableView";
import { TimelineView } from "./TimelineView";
import { DatabaseTitle, ViewToolbar } from "./ViewToolbar";
import type { DatabaseContextValue } from "./context";
import { DatabaseContext } from "./context";
import { DatabasePickerBase } from "./LinkEditors";
import { databasesInDoc, loadDocument, useLinkedDatabases } from "./linked";
import type { Mutator } from "./mutations";
import { DatabaseMutator, LinkedMutator } from "./mutations";

const storageKey = (id: string) => `database-view:${id}`;

function readActiveView(id: string | null): string | null {
  try {
    return id ? window.localStorage.getItem(storageKey(id)) : null;
  } catch {
    return null;
  }
}

type BodyProps = {
  /** Id of the block, to remember its tab. */
  blockId: string;
  /** Data of the database with the views of this block. */
  data: DatabaseData;
  mutator: Mutator;
  /** Rows and views can be changed. */
  editable: boolean;
  /** Columns, title and templates can be changed. */
  schemaEditable: boolean;
  /** The source database (this block for a regular database). */
  source: { documentId?: string; databaseId: string };
  isLinkedView: boolean;
  editorView: EditorView;
  isSelected: boolean;
  /** Shown above the title, e.g. where a linked database comes from. */
  header?: React.ReactNode;
};

/**
 * Title, view tabs with sort / filter / fields, and the active view (table,
 * board, calendar, timeline, gallery, form) of a database or a linked
 * database.
 */
const DatabaseBody = observer(function DatabaseBody({
  blockId,
  data,
  mutator,
  editable: isEditable,
  schemaEditable,
  source,
  isLinkedView,
  editorView,
  isSelected,
  header,
}: BodyProps) {
  const { users, documents } = useStores();
  const { document } = useDocumentContext();
  const rowPages = !!document && source.documentId === document.id;
  const linked = useLinkedDatabases(
    data.columns
      .map((column) => column.relation)
      .filter((ref): ref is DatabaseRef => !!ref),
    editorView,
    document?.id
  );
  const [activeId, setActiveId] = React.useState<string | null>(() => {
    // A link to a form opens its view: ?view=<view id>.
    const fromUrl = new URLSearchParams(window.location.search).get("view");
    return fromUrl && data.views.some((v) => v.id === fromUrl)
      ? fromUrl
      : readActiveView(blockId);
  });
  const [openRowId, setOpenRowId] = React.useState<string | null>(null);
  const [focusRowId, setFocusRowId] = React.useState<string | undefined>();
  const [search, setSearch] = React.useState("");
  // Views changed by readers: not saved, only for them until reload.
  const [ownViews, setOwnViews] = React.useState<Record<string, View>>({});
  const storedView = data.views.find((v) => v.id === activeId) ?? data.views[0];
  const activeView =
    !isEditable && storedView
      ? (ownViews[storedView.id] ?? storedView)
      : storedView;

  // Columns are read from the latest node when an option is created, so
  // several quick edits do not overwrite each other.
  const latest = React.useRef(data);
  latest.current = data;

  const createOption = React.useCallback(
    (column: Column, name: string): SelectOption => {
      const current =
        latest.current.columns.find((c) => c.id === column.id) ?? column;
      const option: SelectOption = {
        id: newId(),
        name,
        color: nextOptionColor(current.options),
      };
      mutator.setColumns(
        latest.current.columns.map((c) =>
          c.id === column.id
            ? { ...c, options: [...(c.options ?? []), option] }
            : c
        )
      );
      return option;
    },
    [mutator]
  );

  const selectView = (id: string) => {
    setActiveId(id);
    try {
      window.localStorage.setItem(storageKey(blockId), id);
    } catch {
      // Remembering the tab is a convenience only.
    }
  };

  if (!activeView) {
    return null;
  }

  const userName = (id: string) => users.get(id)?.name;
  const computed = computeDatabase(data, { userName, related: linked.get });
  const shownColumns = computed.columns.filter(
    (c) => !activeView.hidden.includes(c.id)
  );
  const rows = rowsForView(computed, activeView).filter((row) =>
    rowMatches(shownColumns, row, search, userName)
  );
  const openRow = computed.rows.find((row) => row.id === openRowId);

  const updateView = (next: View) => {
    if (isEditable) {
      mutator.setView(next);
    } else {
      setOwnViews((views) => ({ ...views, [next.id]: next }));
    }
  };

  // Rows created from a template get a copy of its page.
  const copyTemplatePage = async (template: RowTemplate, rowId: string) => {
    if (!document || !template.pageId || !rowPages) {
      return;
    }
    const titleColumn = data.columns[0];
    const title = titleColumn
      ? displayValue(titleColumn, template.cells[titleColumn.id], userName)
      : "";
    const res = await client.post("/documents.duplicate", {
      id: template.pageId,
      title: title || template.name,
      parentDocumentId: document.id,
      publish: !!document.publishedAt,
    });
    const page = res.data.documents?.[0];
    if (page) {
      documents.add(page);
      mutator.setRowDoc(rowId, page.id);
    }
  };

  const addRow = (cells: Record<string, CellValue> = {}) =>
    mutator.addRow(
      {
        ...cellsForFilters(
          data.columns,
          activeView.filters,
          activeView.filterMode
        ),
        ...cells,
      },
      activeView.newRowsFirst ? data.rows[0]?.id : undefined
    );

  const context: DatabaseContextValue = {
    data,
    computed,
    databaseId: source.databaseId,
    documentId: source.documentId,
    editorDocumentId: document?.id,
    schemaEditable: isEditable && schemaEditable,
    rowPages,
    isLinkedView,
    linked,
    editorView,
    view: activeView,
    mutator,
    editable: isEditable,
    createOption,
    openRow: setOpenRowId,
    updateView,
    addRow,
    search,
    setSearch,
    userName,
  };

  return (
    <DatabaseContext.Provider value={context}>
      <Wrapper data-database-ui contentEditable={false} $selected={isSelected}>
        {header}
        <DatabaseTitle />
        <ViewToolbar
          onSelectView={selectView}
          onAddRow={(template) => {
            const id = addRow(template?.cells);
            if (template?.pageId) {
              void copyTemplatePage(template, id);
            }
            if (activeView.type === ViewType.Table) {
              setFocusRowId(id);
            } else {
              setOpenRowId(id);
            }
          }}
        />
        {openRow && (
          <RowPanel row={openRow} onClose={() => setOpenRowId(null)} />
        )}
        {activeView.type === ViewType.Board ? (
          <BoardView rows={rows} />
        ) : activeView.type === ViewType.Form ? (
          <FormView />
        ) : activeView.type === ViewType.Gallery ? (
          <GalleryView rows={rows} />
        ) : activeView.type === ViewType.Calendar ? (
          <CalendarView rows={rows} />
        ) : activeView.type === ViewType.Timeline ? (
          <TimelineView rows={rows} />
        ) : (
          <TableView rows={rows} focusRowId={focusRowId} />
        )}
      </Wrapper>
    </DatabaseContext.Provider>
  );
});

/** The database block: all data lives in the node. */
function DatabaseBlock({
  node,
  view: editorView,
  getPos,
  isEditable,
  isSelected,
}: ComponentProps) {
  const { document } = useDocumentContext();
  const data = React.useMemo(() => databaseFromNode(node), [node]);
  const mutator = React.useMemo(
    () => new DatabaseMutator(editorView, getPos),
    [editorView, getPos]
  );
  return (
    <DatabaseBody
      blockId={node.attrs.id}
      data={data}
      mutator={mutator}
      editable={isEditable}
      schemaEditable
      source={{ documentId: document?.id, databaseId: node.attrs.id }}
      isLinkedView={false}
      editorView={editorView}
      isSelected={isSelected}
    />
  );
}

/**
 * A linked database: the data of a database block shown with the views of
 * this block. Before a source is chosen it shows a picker.
 */
export const LinkedDatabaseBlock = observer(function LinkedDatabaseBlock({
  node,
  view: editorView,
  getPos,
  isEditable,
  isSelected,
}: ComponentProps) {
  const { t } = useTranslation();
  const { document } = useDocumentContext();
  const source = node.attrs.source as DatabaseRef | null;
  const local = !!source && source.documentId === document?.id;
  const linked = useLinkedDatabases(
    source ? [source] : [],
    editorView,
    document?.id
  );
  const sourceData = source ? linked.get(source) : undefined;
  const sourceDocument =
    source && !local ? linked.document(source.documentId) : undefined;
  const latest = React.useRef(sourceData);
  latest.current = sourceData;

  // Databases of other documents are reloaded while the block is shown.
  React.useEffect(() => {
    if (!source || local) {
      return;
    }
    const timer = window.setInterval(
      () => loadDocument(source.documentId, true),
      20000
    );
    return () => window.clearInterval(timer);
  }, [source?.documentId, local]);

  const mutator = React.useMemo(
    () =>
      source
        ? new LinkedMutator(
            editorView,
            getPos,
            source,
            local,
            (rowId) =>
              latest.current?.rows.find((row) => row.id === rowId)?.cells,
            () => loadDocument(source.documentId, true)
          )
        : undefined,
    [editorView, getPos, source?.documentId, source?.databaseId, local]
  );

  const choose = (ref: DatabaseRef) => {
    const pos = getPos();
    if (pos === undefined) {
      return;
    }
    const data =
      ref.documentId === document?.id
        ? databasesInDoc(editorView.state.doc).get(ref.databaseId)
        : linked.document(ref.documentId)?.databases.get(ref.databaseId);
    // The block starts with copies of the views of the source.
    editorView.dispatch(
      editorView.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        source: ref,
        views: data?.views ?? [],
      })
    );
  };

  if (!source) {
    return (
      <Wrapper data-database-ui contentEditable={false} $selected={isSelected}>
        <LinkedHeader>{t("Linked database: choose the source")}</LinkedHeader>
        {isEditable && (
          <PickerBox>
            <DatabasePickerBase
              onChange={choose}
              editorView={editorView}
              documentId={document?.id}
              linked={linked}
            />
          </PickerBox>
        )}
      </Wrapper>
    );
  }

  if (!sourceData || !mutator) {
    return (
      <Wrapper data-database-ui contentEditable={false} $selected={isSelected}>
        <LinkedHeader>
          {!local && linked.status(source.documentId) === "error"
            ? t("No access to the linked database")
            : !local && linked.status(source.documentId) === "loading"
              ? t("Loading…")
              : t("Linked database not found")}
        </LinkedHeader>
      </Wrapper>
    );
  }

  const ownViews = normalizeDatabase({ views: node.attrs.views }).views;
  const data = {
    ...sourceData,
    views: (node.attrs.views as View[] | undefined)?.length
      ? ownViews
      : sourceData.views,
  };
  return (
    <DatabaseBody
      blockId={node.attrs.id}
      data={data}
      mutator={mutator}
      editable={isEditable && (local || !!sourceDocument?.canUpdate)}
      schemaEditable={local}
      source={source}
      isLinkedView
      editorView={editorView}
      isSelected={isSelected}
      header={
        <LinkedHeader>
          {t("Linked database")}
          {sourceDocument && (
            <>
              {" · "}
              <Link to={sourceDocument.url}>
                {sourceDocument.title || t("Untitled")}
              </Link>
            </>
          )}
        </LinkedHeader>
      }
    />
  );
});

const LinkedHeader = styled.div`
  color: ${s("textTertiary")};
  font-size: 12px;

  a {
    color: ${s("textSecondary")};
  }
`;

const PickerBox = styled.div`
  max-width: 360px;
  padding: 4px 0;
`;

const Wrapper = styled.div<{ $selected: boolean }>`
  margin: 12px 0;
  color: ${s("text")};
  font-size: 14px;
  white-space: normal;
  cursor: default;
  user-select: text;
  border-radius: 6px;
  ${(props) =>
    props.$selected &&
    css`
      outline: 2px solid ${props.theme.accent};
      outline-offset: 4px;
    `}

  input,
  select,
  button {
    font-family: inherit;
  }
`;

export default observer(DatabaseBlock);
