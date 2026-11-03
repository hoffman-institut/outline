import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type { CellValue } from "@shared/editor/lib/database";
import { ColumnType } from "@shared/editor/lib/database";
import { calculatedTypes } from "@shared/editor/lib/databaseCompute";
import { s } from "@shared/styles";
import { client } from "~/utils/ApiClient";
import { Cell } from "./Cell";
import { ColumnTypeIcon } from "./ColumnMenu";
import { SmallButton } from "./components";
import { useDatabase } from "./context";

/**
 * Form that adds a row. Fields are the shown columns of the view. People who
 * cannot edit the document send the row through the API, which accepts only
 * these fields.
 */
export function FormView() {
  const { t } = useTranslation();
  const { data, view, editable, documentId, databaseId, addRow, createOption } =
    useDatabase();
  const [draft, setDraft] = React.useState<Record<string, CellValue>>({});
  const [state, setState] = React.useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const fields = data.columns.filter(
    (column) =>
      !view.hidden.includes(column.id) &&
      !calculatedTypes.includes(column.type) &&
      column.type !== ColumnType.AutoNumber
  );

  const submit = async () => {
    setState("sending");
    try {
      if (editable) {
        addRow(draft);
      } else {
        await client.post("/databases.addRow", {
          documentId,
          databaseId,
          cells: draft,
        });
      }
      setDraft({});
      setState("sent");
    } catch {
      setState("error");
    }
  };

  return (
    <Form>
      {fields.map((column) => (
        <Field key={column.id}>
          <FieldName>
            <ColumnTypeIcon type={column.type} />
            {column.name}
          </FieldName>
          <FieldValue>
            <Cell
              column={column}
              value={draft[column.id]}
              editable
              onChange={(value) =>
                setDraft((current) => ({ ...current, [column.id]: value }))
              }
              onCreateOption={
                editable ? (name) => createOption(column, name) : undefined
              }
            />
          </FieldValue>
        </Field>
      ))}
      <Footer>
        <SmallButton
          type="button"
          $highlight
          disabled={state === "sending" || !documentId}
          onClick={submit}
        >
          {t("Submit")}
        </SmallButton>
        {state === "sent" && <Note>{t("Sent, thank you")}</Note>}
        {state === "error" && <Note>{t("Could not send, try again")}</Note>}
      </Footer>
      {editable && (
        <Note>
          {t(
            "Readers of the document can fill in this form. Choose its fields in “Fields”."
          )}
        </Note>
      )}
    </Form>
  );
}

const Form = styled.div`
  max-width: 560px;
  padding: 8px 0;
`;

const Field = styled.div`
  margin-bottom: 8px;
  border: 1px solid ${s("divider")};
  border-radius: 6px;
`;

const FieldName = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px 0;
  color: ${s("textSecondary")};
  font-size: 13px;
  font-weight: 500;
`;

const FieldValue = styled.div`
  min-height: 34px;
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
`;

const Note = styled.div`
  color: ${s("textTertiary")};
  font-size: 13px;
`;
