import { CheckmarkIcon, PlusIcon } from "outline-icons";
import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import styled from "styled-components";
import { Calendar } from "@shared/components/Calendar";
import type {
  CellValue,
  Column,
  SelectOption,
} from "@shared/editor/lib/database";
import {
  ColumnType,
  displayValue,
  formatDate,
  parseDateValue,
  todayValue,
} from "@shared/editor/lib/database";
import type { LinkedRow } from "@shared/editor/lib/databaseCompute";
import {
  computeDatabase,
  linkedRows,
} from "@shared/editor/lib/databaseCompute";
import { s } from "@shared/styles";
import { dateLocale, locales } from "@shared/utils/date";
import { Avatar, AvatarSize } from "~/components/Avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/primitives/Popover";
import useStores from "~/hooks/useStores";
import useUserLocale from "~/hooks/useUserLocale";
import { client } from "~/utils/ApiClient";
import { Chip, MenuRow, PopoverBody, TextInput, stop } from "./components";
import { useDatabase } from "./context";
import { databasePos, loadDocument } from "./linked";
import { DatabaseMutator } from "./mutations";

export type CellProps = {
  column: Column;
  value: CellValue | undefined;
  editable: boolean;
  onChange: (value: CellValue) => void;
  /** Creates a new option in the column and returns it. */
  onCreateOption?: (name: string) => SelectOption;
  /** Opens the editor immediately (new rows, keyboard navigation). */
  autoFocus?: boolean;
  /** Relation and backlink cells: the linked rows with their titles. */
  links?: LinkedRow[];
};

/** Displays a cell and, when editable, lets the user change it in place. */
export function Cell(props: CellProps) {
  switch (props.column.type) {
    case ColumnType.Checkbox:
      return <CheckboxCell {...props} />;
    case ColumnType.Select:
    case ColumnType.MultiSelect:
      return <SelectCell {...props} />;
    case ColumnType.Date:
      return <DateCell {...props} />;
    case ColumnType.Person:
      return <PersonCell {...props} />;
    case ColumnType.Relation:
    case ColumnType.Backlink:
      return <RelationCell {...props} />;
    case ColumnType.AutoNumber:
      // Numbers are given to new rows, they are not typed.
      return <TextCell {...props} editable={false} />;
    default:
      return <TextCell {...props} />;
  }
}

/** Rows of another database (or this one) linked to the row. */
function RelationCell({ column, value, links, editable, onChange }: CellProps) {
  const { t } = useTranslation();
  const { linked, editorView, documentId } = useDatabase();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const ref = column.relation;
  const status = ref ? linked.status(ref.documentId) : "error";
  const selectedIds = Array.isArray(value) ? value : [];
  const target = ref ? linked.get(ref) : undefined;
  const candidates = target ? linkedRows(computeDatabase(target)) : [];
  // Cells of forms have no calculated links: titles come from the target.
  const shown =
    links ??
    selectedIds.map((id) => ({
      id,
      title: candidates.find((row) => row.id === id)?.title ?? "",
    }));

  const chips = (
    <Chips>
      {shown.map((row) => (
        <LinkChip key={row.id}>
          {row.title || (status === "loading" ? "…" : t("Untitled"))}
        </LinkChip>
      ))}
    </Chips>
  );

  if (!editable || column.type !== ColumnType.Relation) {
    return <CellText>{chips}</CellText>;
  }

  const trimmed = query.trim().toLowerCase();
  const exact = candidates.some(
    (row) => row.title.trim().toLowerCase() === trimmed
  );

  // A new row of the linked database, titled with the search text. In this
  // document it is added in the editor, in another one through the API.
  const createRow = async () => {
    const title = query.trim();
    if (!ref || !target || !title) {
      return;
    }
    const titleColumn =
      target.columns.find((c) => c.type === ColumnType.Text) ??
      target.columns[0];
    setCreating(true);
    setFailed(false);
    try {
      let rowId: string;
      if (ref.documentId === documentId) {
        rowId = new DatabaseMutator(editorView, () =>
          databasePos(editorView.state.doc, ref.databaseId)
        ).addRow(titleColumn ? { [titleColumn.id]: title } : {});
      } else {
        const res = await client.post("/databases.addRow", {
          documentId: ref.documentId,
          databaseId: ref.databaseId,
          cells: titleColumn ? { [titleColumn.id]: title } : {},
        });
        rowId = res.data.rowId;
        loadDocument(ref.documentId, true);
      }
      onChange([...selectedIds, rowId]);
      setQuery("");
    } catch {
      setFailed(true);
    } finally {
      setCreating(false);
    }
  };
  const matches = candidates.filter((row) =>
    (row.title || t("Untitled")).toLowerCase().includes(trimmed)
  );
  const document = ref ? linked.document(ref.documentId) : undefined;

  const toggle = (rowId: string) => {
    // Ids of rows deleted from the linked database are dropped on change.
    const existing = selectedIds.filter((id) =>
      candidates.some((row) => row.id === id)
    );
    onChange(
      existing.includes(rowId)
        ? existing.filter((id) => id !== rowId)
        : [...existing, rowId]
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <CellButton type="button">{chips}</CellButton>
      </PopoverTrigger>
      <PopoverContent width={280} shrink align="start" onClick={stop}>
        <PopoverBody>
          {!ref ? (
            <Hint>{t("Choose the linked database in the column menu")}</Hint>
          ) : status === "error" ? (
            <Hint>{t("No access to the linked database")}</Hint>
          ) : !target ? (
            <Hint>
              {status === "loading"
                ? t("Loading…")
                : t("Linked database not found")}
            </Hint>
          ) : (
            <>
              <TextInput
                autoFocus
                placeholder={t("Search")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <OptionList>
                {matches.map((row) => (
                  <MenuRow
                    key={row.id}
                    type="button"
                    onClick={() => toggle(row.id)}
                  >
                    <LinkChip>{row.title || t("Untitled")}</LinkChip>
                    {selectedIds.includes(row.id) && (
                      <Right>
                        <CheckmarkIcon size={18} />
                      </Right>
                    )}
                  </MenuRow>
                ))}
                {matches.length === 0 && !trimmed && (
                  <Hint>{t("No rows")}</Hint>
                )}
                {trimmed && !exact && (
                  <MenuRow
                    type="button"
                    disabled={creating}
                    onClick={createRow}
                  >
                    <PlusIcon size={18} />
                    {t("Create “{{ name }}”", { name: query.trim() })}
                  </MenuRow>
                )}
                {failed && <Hint>{t("Could not create the row")}</Hint>}
              </OptionList>
            </>
          )}
          {document && (
            <Hint>
              <Link to={document.url}>{document.title || t("Untitled")}</Link>
            </Hint>
          )}
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}

function linkFor(type: ColumnType, text: string): string | undefined {
  if (!text) {
    return undefined;
  }
  switch (type) {
    case ColumnType.Url:
      return /^https?:\/\//i.test(text) ? text : `https://${text}`;
    case ColumnType.Email:
      return `mailto:${text}`;
    case ColumnType.Phone:
      return `tel:${text.replace(/[^\d+]/g, "")}`;
    default:
      return undefined;
  }
}

function TextCell({ column, value, editable, onChange, autoFocus }: CellProps) {
  const isNumber = column.type === ColumnType.Number;
  const text = value === null || value === undefined ? "" : String(value);
  // Numbers are shown formatted (1 500 ₽) and edited as typed (1500).
  const shown =
    text &&
    (isNumber || column.type === ColumnType.AutoNumber) &&
    typeof value === "number"
      ? displayValue(column, value)
      : text;
  const [editing, setEditing] = React.useState(!!autoFocus && editable);
  const [draft, setDraft] = React.useState(text);

  const start = () => {
    if (!editable) {
      return;
    }
    setDraft(text);
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next === text) {
      return;
    }
    if (isNumber) {
      const n = parseFloat(next.replace(",", "."));
      onChange(next === "" || !Number.isFinite(n) ? null : n);
    } else {
      onChange(next);
    }
  };

  if (editing) {
    return (
      <CellInput
        autoFocus
        value={draft}
        inputMode={isNumber ? "decimal" : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") {
            setEditing(false);
          }
        }}
      />
    );
  }

  const href = linkFor(column.type, text);
  return (
    <CellText
      $number={isNumber || column.type === ColumnType.AutoNumber}
      onClick={start}
      $editable={editable}
    >
      {isNumber && column.showAs === "bar" && typeof value === "number" ? (
        <Progress>
          <ProgressTrack>
            <ProgressFill
              style={{
                width: `${Math.max(0, Math.min(100, (value / (column.max ?? 100)) * 100))}%`,
              }}
            />
          </ProgressTrack>
          {shown}
        </Progress>
      ) : href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
        >
          {text}
        </a>
      ) : (
        shown
      )}
    </CellText>
  );
}

function CheckboxCell({ value, editable, onChange }: CellProps) {
  return (
    <CheckboxWrap>
      <input
        type="checkbox"
        checked={!!value}
        disabled={!editable}
        onChange={(event) => onChange(event.target.checked)}
      />
    </CheckboxWrap>
  );
}

function SelectCell({
  column,
  value,
  editable,
  onChange,
  onCreateOption,
}: CellProps) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const multi = column.type === ColumnType.MultiSelect;
  const options = column.options ?? [];
  const selectedIds: string[] = multi
    ? Array.isArray(value)
      ? value
      : []
    : typeof value === "string"
      ? [value]
      : [];
  const selected = selectedIds
    .map((id) => options.find((o) => o.id === id))
    .filter((o): o is SelectOption => !!o);
  const trimmed = query.trim();
  const matches = options.filter((o) =>
    o.name.toLowerCase().includes(trimmed.toLowerCase())
  );
  const exact = options.some(
    (o) => o.name.toLowerCase() === trimmed.toLowerCase()
  );

  const toggle = (option: SelectOption) => {
    if (multi) {
      onChange(
        selectedIds.includes(option.id)
          ? selectedIds.filter((id) => id !== option.id)
          : [...selectedIds, option.id]
      );
    } else {
      onChange(selectedIds[0] === option.id ? null : option.id);
      setOpen(false);
    }
    setQuery("");
  };

  const create = () => {
    if (!trimmed || exact || !onCreateOption) {
      return;
    }
    toggle(onCreateOption(trimmed));
  };

  const chips = (
    <Chips>
      {selected.map((option) => (
        <Chip key={option.id} option={option} />
      ))}
    </Chips>
  );

  if (!editable) {
    return <CellText>{chips}</CellText>;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <CellButton type="button">{chips}</CellButton>
      </PopoverTrigger>
      <PopoverContent width={260} shrink align="start" onClick={stop}>
        <PopoverBody>
          {multi && selected.length > 0 && (
            <Chips $wrap>
              {selected.map((option) => (
                <Chip
                  key={option.id}
                  option={option}
                  onRemove={() => toggle(option)}
                />
              ))}
            </Chips>
          )}
          <TextInput
            autoFocus
            placeholder={t("Search or create an option")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (matches.length === 1) {
                  toggle(matches[0]);
                } else {
                  create();
                }
              }
            }}
          />
          <OptionList>
            {matches.map((option) => (
              <MenuRow
                key={option.id}
                type="button"
                onClick={() => toggle(option)}
              >
                <Chip option={option} />
                {selectedIds.includes(option.id) && (
                  <Right>
                    <CheckmarkIcon size={18} />
                  </Right>
                )}
              </MenuRow>
            ))}
            {trimmed && !exact && onCreateOption && (
              <MenuRow type="button" onClick={create}>
                <PlusIcon size={18} />
                {t("Create “{{ name }}”", { name: trimmed })}
              </MenuRow>
            )}
          </OptionList>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}

function DateCell({ value, editable, onChange }: CellProps) {
  const { t } = useTranslation();
  const language = useUserLocale();
  const [open, setOpen] = React.useState(false);
  const parsed = parseDateValue(value);
  const selected = parsed
    ? new Date(parsed.year, parsed.month - 1, parsed.day)
    : undefined;
  const text = formatDate(value);

  if (!editable) {
    return <CellText>{text}</CellText>;
  }

  const pick = (date: Date | undefined) => {
    onChange(date ? todayValue(date) : null);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <CellButton type="button">{text}</CellButton>
      </PopoverTrigger>
      <PopoverContent width={300} shrink align="start" onClick={stop}>
        <DayPickerStyles>
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            onSelect={pick}
            captionLayout="dropdown-buttons"
            fromYear={1930}
            toYear={new Date().getFullYear() + 10}
            weekStartsOn={1}
            locale={dateLocale(language as keyof typeof locales)}
          />
        </DayPickerStyles>
        <PopoverBody>
          <MenuRow type="button" onClick={() => pick(new Date())}>
            {t("Today")}
          </MenuRow>
          {text && (
            <MenuRow type="button" $danger onClick={() => pick(undefined)}>
              {t("Clear")}
            </MenuRow>
          )}
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}

const PersonCell = observer(function PersonCell({
  value,
  editable,
  onChange,
}: CellProps) {
  const { t } = useTranslation();
  const { users } = useStores();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const ids: string[] = Array.isArray(value) ? value : [];

  React.useEffect(() => {
    if (open) {
      void users.fetchPage({ limit: 100 });
    }
  }, [open, users]);

  const people = ids.map((id) => ({ id, user: users.get(id) }));
  const display = (
    <Chips>
      {people.map(({ id, user }) => (
        <Person key={id}>
          {user && <Avatar model={user} size={AvatarSize.Small} />}
          {user?.name ?? t("Unknown")}
        </Person>
      ))}
    </Chips>
  );

  if (!editable) {
    return <CellText>{display}</CellText>;
  }

  const candidates = users.active.filter((user) =>
    user.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <CellButton type="button">{display}</CellButton>
      </PopoverTrigger>
      <PopoverContent width={280} shrink align="start" onClick={stop}>
        <PopoverBody>
          <TextInput
            autoFocus
            placeholder={t("Search people")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <OptionList>
            {candidates.map((user) => (
              <MenuRow
                key={user.id}
                type="button"
                onClick={() =>
                  onChange(
                    ids.includes(user.id)
                      ? ids.filter((id) => id !== user.id)
                      : [...ids, user.id]
                  )
                }
              >
                <Avatar model={user} size={AvatarSize.Small} />
                {user.name}
                {ids.includes(user.id) && (
                  <Right>
                    <CheckmarkIcon size={18} />
                  </Right>
                )}
              </MenuRow>
            ))}
          </OptionList>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
});

const CellText = styled.div<{ $number?: boolean; $editable?: boolean }>`
  min-height: 34px;
  padding: 6px 8px;
  font-size: 14px;
  line-height: 22px;
  white-space: pre-wrap;
  word-break: break-word;
  text-align: ${(props) => (props.$number ? "right" : "left")};
  cursor: ${(props) => (props.$editable ? "text" : "default")};

  a {
    color: ${s("accent")};
    text-decoration: underline;
  }
`;

const CellButton = styled.button`
  display: block;
  width: 100%;
  min-height: 34px;
  padding: 6px 8px;
  border: 0;
  background: none;
  color: ${s("text")};
  font-size: 14px;
  line-height: 22px;
  text-align: left;
  cursor: pointer;
`;

const CellInput = styled.input`
  width: 100%;
  min-height: 34px;
  padding: 6px 8px;
  border: 0;
  outline: 2px solid ${s("accent")};
  outline-offset: -2px;
  background: ${s("background")};
  color: ${s("text")};
  font-size: 14px;
`;

const CheckboxWrap = styled.div`
  display: flex;
  align-items: center;
  min-height: 34px;
  padding: 0 8px;

  input {
    width: 16px;
    height: 16px;
    cursor: pointer;
  }
`;

// react-day-picker dropdown captions need their base styles: the native select
// is laid invisibly over the visible month / year label.
const DayPickerStyles = styled.div`
  .rdp-caption_dropdowns {
    position: relative;
    display: inline-flex;
    gap: 12px;
  }

  .rdp-dropdown_month,
  .rdp-dropdown_year {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .rdp-dropdown {
    appearance: none;
    position: absolute;
    z-index: 2;
    inset: 0;
    width: 100%;
    margin: 0;
    padding: 0;
    opacity: 0;
    border: none;
    background: transparent;
    font: inherit;
    cursor: pointer;
  }

  .rdp-caption_label {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-weight: 600;
    text-transform: capitalize;
  }
`;

const Chips = styled.span<{ $wrap?: boolean }>`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  ${(props) => props.$wrap && "padding: 2px 2px 6px;"}
`;

const Progress = styled.span`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ProgressTrack = styled.span`
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: ${s("divider")};
  overflow: hidden;
`;

const ProgressFill = styled.span`
  display: block;
  height: 100%;
  border-radius: 3px;
  background: ${s("accent")};
`;

const LinkChip = styled.span`
  display: inline-block;
  max-width: 100%;
  padding: 0 6px;
  border-radius: 4px;
  background: ${s("listItemHoverBackground")};
  color: ${s("text")};
  font-size: 13px;
  line-height: 20px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Hint = styled.div`
  padding: 6px 8px;
  color: ${s("textTertiary")};
  font-size: 13px;

  a {
    color: ${s("accent")};
  }
`;

const OptionList = styled.div`
  max-height: 260px;
  overflow-y: auto;
  margin-top: 4px;
`;

const Right = styled.span`
  margin-left: auto;
  display: flex;
`;

const Person = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
`;
