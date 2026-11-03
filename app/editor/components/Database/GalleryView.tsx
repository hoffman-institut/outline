import { PlusIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import {
  ColumnType,
  displayValue,
  isImage,
  parseFiles,
} from "@shared/editor/lib/database";
import type { ComputedRow } from "@shared/editor/lib/databaseCompute";
import { s } from "@shared/styles";
import { CardField } from "./BoardView";
import { useDatabase } from "./context";

/** Cards with a cover picture from a files column. */
export function GalleryView({ rows }: { rows: ComputedRow[] }) {
  const { t } = useTranslation();
  const { computed, view, editable, openRow, addRow } = useDatabase();
  const filesColumns = computed.columns.filter(
    (c) => c.type === ColumnType.Files
  );
  const cover =
    filesColumns.find((c) => c.id === view.coverColumn) ?? filesColumns[0];
  const titleColumn = computed.columns[0];
  const fields = computed.columns.filter(
    (c) =>
      !view.hidden.includes(c.id) &&
      c.id !== titleColumn?.id &&
      c.id !== cover?.id
  );

  return (
    <Grid>
      {rows.map((row) => {
        const image = cover
          ? parseFiles(row.cells[cover.id]).find(isImage)
          : undefined;
        const title = titleColumn
          ? displayValue(titleColumn, row.cells[titleColumn.id])
          : "";
        return (
          <Tile key={row.id} role="button" onClick={() => openRow(row.id)}>
            <Cover>{image && <img src={image.url} alt="" />}</Cover>
            <Body>
              <Title>{title || t("Untitled")}</Title>
              {fields.map((column) => (
                <CardField
                  key={column.id}
                  column={column}
                  value={row.cells[column.id]}
                  links={row.links?.[column.id]}
                />
              ))}
            </Body>
          </Tile>
        );
      })}
      {editable && (
        <AddTile type="button" onClick={() => openRow(addRow())}>
          <PlusIcon size={18} />
          {t("New", { context: "database" })}
        </AddTile>
      )}
    </Grid>
  );
}

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  padding: 8px 0 12px;
`;

const Tile = styled.div`
  border: 1px solid ${s("divider")};
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;

  &:hover {
    border-color: ${s("textTertiary")};
  }
`;

const Cover = styled.div`
  height: 140px;
  background: ${s("backgroundSecondary")};

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`;

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px 10px;
`;

const Title = styled.div`
  font-size: 14px;
  font-weight: 500;
`;

const AddTile = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 200px;
  border: 1px dashed ${s("divider")};
  border-radius: 8px;
  background: none;
  color: ${s("textTertiary")};
  font-size: 14px;
  cursor: pointer;

  &:hover {
    color: ${s("text")};
  }
`;
