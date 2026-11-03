import { CheckmarkIcon, PlusIcon } from "outline-icons";
import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Calendar } from "@shared/components/Calendar";
import type {
  CellValue,
  Column,
  SelectOption,
} from "@shared/editor/lib/database";
import {
  ColumnType,
  formatDate,
  parseDateValue,
  todayValue,
} from "@shared/editor/lib/database";
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
import { Chip, MenuRow, PopoverBody, TextInput, stop } from "./components";

export type CellProps = {
  column: Column;
  value: CellValue | undefined;
  editable: boolean;
  onChange: (value: CellValue) => void;
  /** Creates a new option in the column and returns it. */
  onCreateOption: (name: string) => SelectOption;
  /** Opens the editor immediately (new rows, keyboard navigation). */
  autoFocus?: boolean;
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
    default:
      return <TextCell {...props} />;
  }
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
    <CellText $number={isNumber} onClick={start} $editable={editable}>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
        >
          {text}
        </a>
      ) : (
        text
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
    if (!trimmed || exact) {
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
            {trimmed && !exact && (
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
