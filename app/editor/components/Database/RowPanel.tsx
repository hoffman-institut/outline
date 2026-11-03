import {
  CloseIcon,
  DocumentIcon,
  NewDocumentIcon,
  TrashIcon,
} from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import styled from "styled-components";
import { displayValue } from "@shared/editor/lib/database";
import type { ComputedRow } from "@shared/editor/lib/databaseCompute";
import { isComputed } from "@shared/editor/lib/databaseCompute";
import { s } from "@shared/styles";
import { useDocumentContext } from "~/components/DocumentContext";
import useStores from "~/hooks/useStores";
import { client } from "~/utils/ApiClient";
import { Cell } from "./Cell";
import { ColumnTypeIcon } from "./ColumnMenu";
import { CellError, SmallButton } from "./components";
import { useDatabase } from "./context";

/** All fields of one row, shown above the view (opened from cards and rows). */
export function RowPanel({
  row,
  onClose,
}: {
  row: ComputedRow;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { computed, editable, mutator, createOption, rowPages } = useDatabase();
  const { documents } = useStores();
  const { document } = useDocumentContext();
  const [creating, setCreating] = React.useState(false);
  const titleColumn = computed.columns[0];
  const title = titleColumn
    ? displayValue(titleColumn, row.cells[titleColumn.id])
    : "";
  const page = row.docId ? documents.get(row.docId) : undefined;

  React.useEffect(() => {
    if (row.docId && !page) {
      void documents.fetch(row.docId).catch(() => undefined);
    }
  }, [row.docId, page, documents]);

  // The row page is a child document, like rows of Yonote databases.
  const createPage = async () => {
    if (!document) {
      return;
    }
    setCreating(true);
    try {
      const res = await client.post("/documents.create", {
        title: title || t("Untitled"),
        parentDocumentId: document.id,
        collectionId: document.collectionId,
        text: t("Row of the database in “{{ title }}”.", {
          title: document.titleWithDefault,
        }),
        publish: !!document.publishedAt,
      });
      documents.add(res.data);
      mutator.setRowDoc(row.id, res.data.id);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>{title || t("Untitled")}</PanelTitle>
        {page ? (
          <Link to={page.url}>
            <SmallButton as="span">
              <DocumentIcon size={18} />
              {t("Open page")}
            </SmallButton>
          </Link>
        ) : (
          editable &&
          rowPages &&
          document && (
            <SmallButton type="button" disabled={creating} onClick={createPage}>
              <NewDocumentIcon size={18} />
              {t("Create page")}
            </SmallButton>
          )
        )}
        {editable && (
          <SmallButton
            type="button"
            onClick={() => {
              mutator.deleteRow(row.id);
              onClose();
            }}
          >
            <TrashIcon size={18} />
          </SmallButton>
        )}
        <SmallButton type="button" aria-label={t("Close")} onClick={onClose}>
          <CloseIcon size={18} />
        </SmallButton>
      </PanelHeader>
      <Fields>
        {computed.columns.map((column) => (
          <React.Fragment key={column.id}>
            <FieldName>
              <ColumnTypeIcon type={column.source?.type ?? column.type} />
              {column.name}
            </FieldName>
            <FieldValue>
              {row.errors?.[column.id] ? (
                <CellError>{row.errors[column.id]}</CellError>
              ) : (
                <Cell
                  column={column}
                  value={row.cells[column.id]}
                  links={row.links?.[column.id]}
                  editable={editable && !isComputed(column)}
                  onChange={(value) =>
                    mutator.setCells(row.id, { [column.id]: value })
                  }
                  onCreateOption={(name) => createOption(column, name)}
                />
              )}
            </FieldValue>
          </React.Fragment>
        ))}
      </Fields>
    </Panel>
  );
}

const Panel = styled.div`
  margin: 8px 0;
  padding: 8px 12px 12px;
  border: 1px solid ${s("inputBorder")};
  border-radius: 8px;
  background: ${s("background")};
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
`;

const PanelTitle = styled.div`
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  word-break: break-word;
`;

const Fields = styled.div`
  display: grid;
  grid-template-columns: minmax(120px, 200px) 1fr;
  align-items: start;
`;

const FieldName = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  color: ${s("textSecondary")};
  font-size: 14px;

  svg {
    flex-shrink: 0;
  }
`;

const FieldValue = styled.div`
  min-width: 0;
  border-radius: 4px;

  &:hover {
    background: ${s("listItemHoverBackground")};
  }
`;
