import { observer } from "mobx-react";
import {
  CalendarIcon,
  CloseIcon,
  EyeIcon,
  MoreIcon,
  PlusIcon,
  SearchIcon,
  SortAscendingIcon,
  TableIcon,
  TrashIcon,
  DuplicateIcon,
  BuildingBlocksIcon,
} from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type {
  FilterOperator,
  FilterRule,
  SortRule,
  View,
} from "@shared/editor/lib/database";
import {
  ColumnType,
  ViewType,
  createView,
  newId,
  operatorsFor,
} from "@shared/editor/lib/database";
import { s } from "@shared/styles";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/primitives/Popover";
import useStores from "~/hooks/useStores";
import { ColumnTypeIcon } from "./ColumnMenu";
import {
  MenuDivider,
  MenuLabel,
  MenuRow,
  PopoverBody,
  Select,
  SmallButton,
  TextInput,
  stop,
} from "./components";
import { useDatabase, useUpdateView } from "./context";

export function ViewIcon({ type }: { type: ViewType }) {
  switch (type) {
    case ViewType.Board:
      return <BuildingBlocksIcon size={18} />;
    case ViewType.Calendar:
      return <CalendarIcon size={18} />;
    default:
      return <TableIcon size={18} />;
  }
}

/** View tabs and the sort / filter / fields controls of the current view. */
export function ViewToolbar({
  onSelectView,
  onAddRow,
}: {
  onSelectView: (id: string) => void;
  onAddRow: () => void;
}) {
  const { t } = useTranslation();
  const { data, view, mutator, editable } = useDatabase();

  const viewTypes = [
    { type: ViewType.Table, label: t("Table") },
    { type: ViewType.Board, label: t("Board") },
    { type: ViewType.Calendar, label: t("Calendar") },
  ];

  const addView = (type: ViewType, label: string) => {
    const added = createView(type, label);
    if (type === ViewType.Board) {
      const groupBy = data.columns.find((c) => c.type === ColumnType.Select);
      if (groupBy) {
        added.groupBy = groupBy.id;
      }
    }
    if (type === ViewType.Calendar) {
      const dateColumn = data.columns.find((c) => c.type === ColumnType.Date);
      if (dateColumn) {
        added.dateColumn = dateColumn.id;
      }
    }
    mutator.setAttrs({ views: [...data.views, added] });
    onSelectView(added.id);
  };

  return (
    <Bar>
      <Tabs>
        {data.views.map((v) =>
          v.id === view.id && editable ? (
            <ViewTabMenu key={v.id} current={v} onSelectView={onSelectView} />
          ) : (
            <Tab
              key={v.id}
              type="button"
              $active={v.id === view.id}
              onClick={() => onSelectView(v.id)}
            >
              <ViewIcon type={v.type} />
              {v.name}
            </Tab>
          )
        )}
        {editable && (
          <Popover>
            <PopoverTrigger>
              <SmallButton type="button" aria-label={t("Add view")}>
                <PlusIcon size={18} />
              </SmallButton>
            </PopoverTrigger>
            <PopoverContent width={220} shrink align="start" onClick={stop}>
              <PopoverBody>
                <MenuLabel>{t("Add view")}</MenuLabel>
                {viewTypes.map((item) => (
                  <MenuRow
                    key={item.type}
                    type="button"
                    onClick={() => addView(item.type, item.label)}
                  >
                    <ViewIcon type={item.type} />
                    {item.label}
                  </MenuRow>
                ))}
              </PopoverBody>
            </PopoverContent>
          </Popover>
        )}
      </Tabs>
      <Actions>
        <SortButton />
        <FilterButton />
        <FieldsButton />
        {editable && (
          <SmallButton type="button" onClick={onAddRow}>
            <PlusIcon size={18} />
            {t("New", { context: "database" })}
          </SmallButton>
        )}
        {editable && <DatabaseMenu />}
      </Actions>
    </Bar>
  );
}

function ViewTabMenu({
  current,
  onSelectView,
}: {
  current: View;
  onSelectView: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { data, mutator } = useDatabase();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(current.name);

  const rename = () => {
    if (name.trim() && name !== current.name) {
      mutator.setView({ ...current, name: name.trim() });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <Tab type="button" $active>
          <ViewIcon type={current.type} />
          {current.name}
        </Tab>
      </PopoverTrigger>
      <PopoverContent width={240} shrink align="start" onClick={stop}>
        <PopoverBody>
          <TextInput
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={rename}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                rename();
                setOpen(false);
              }
            }}
          />
          <MenuRow
            type="button"
            onClick={() => {
              const copy = { ...current, id: newId(), name: `${current.name} 2` };
              mutator.setAttrs({ views: [...data.views, copy] });
              onSelectView(copy.id);
              setOpen(false);
            }}
          >
            <DuplicateIcon size={18} />
            {t("Duplicate view")}
          </MenuRow>
          {data.views.length > 1 && (
            <MenuRow
              type="button"
              $danger
              onClick={() => {
                const rest = data.views.filter((v) => v.id !== current.id);
                mutator.setAttrs({ views: rest });
                onSelectView(rest[0].id);
                setOpen(false);
              }}
            >
              <TrashIcon size={18} />
              {t("Delete view")}
            </MenuRow>
          )}
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}

function SortButton() {
  const { t } = useTranslation();
  const { data, view, editable } = useDatabase();
  const updateView = useUpdateView();
  const columns = data.columns;

  const setRule = (index: number, patch: Partial<SortRule>) =>
    updateView({
      sort: view.sort.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)),
    });

  return (
    <Popover>
      <PopoverTrigger>
        <SmallButton type="button" $highlight={view.sort.length > 0}>
          <SortAscendingIcon size={18} />
          {t("Sort")}
          {view.sort.length > 0 && ` · ${view.sort.length}`}
        </SmallButton>
      </PopoverTrigger>
      <PopoverContent width={420} shrink align="end" onClick={stop}>
        <PopoverBody>
          {view.sort.length === 0 && <Hint>{t("No sorting: manual order")}</Hint>}
          {view.sort.map((rule, index) => {
            const column = columns.find((c) => c.id === rule.columnId);
            return (
              <RuleRow key={`${rule.columnId}-${index}`}>
                <Select
                  disabled={!editable}
                  value={rule.columnId}
                  onChange={(event) =>
                    setRule(index, { columnId: event.target.value, upcoming: false })
                  }
                >
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                <Select
                  disabled={!editable}
                  value={rule.upcoming ? "upcoming" : rule.direction}
                  onChange={(event) =>
                    setRule(
                      index,
                      event.target.value === "upcoming"
                        ? { direction: "asc", upcoming: true }
                        : {
                            direction: event.target.value as "asc" | "desc",
                            upcoming: false,
                          }
                    )
                  }
                >
                  <option value="asc">{t("Ascending")}</option>
                  <option value="desc">{t("Descending")}</option>
                  {column?.type === ColumnType.Date && (
                    <option value="upcoming">{t("Nearest dates first")}</option>
                  )}
                </Select>
                {editable && (
                  <IconButton
                    type="button"
                    aria-label={t("Remove")}
                    onClick={() =>
                      updateView({ sort: view.sort.filter((_, i) => i !== index) })
                    }
                  >
                    <CloseIcon size={18} />
                  </IconButton>
                )}
              </RuleRow>
            );
          })}
          {editable && columns.length > 0 && (
            <MenuRow
              type="button"
              onClick={() =>
                updateView({
                  sort: [
                    ...view.sort,
                    { columnId: columns[0].id, direction: "asc" },
                  ],
                })
              }
            >
              + {t("Add sort")}
            </MenuRow>
          )}
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}

function useOperatorLabels(): Record<FilterOperator, string> {
  const { t } = useTranslation();
  return {
    contains: t("contains"),
    not_contains: t("does not contain"),
    is: t("is"),
    is_not: t("is not"),
    is_empty: t("is empty"),
    is_not_empty: t("is not empty"),
    gt: t("greater than"),
    lt: t("less than"),
    before: t("before"),
    after: t("after"),
    next_days: t("in the next N days (yearly)"),
    checked: t("is checked"),
    unchecked: t("is not checked"),
  };
}

const FilterValue = observer(function FilterValue({
  rule,
  onChange,
}: {
  rule: FilterRule;
  onChange: (value: string | number) => void;
}) {
  const { t } = useTranslation();
  const { data, editable } = useDatabase();
  const { users } = useStores();
  const column = data.columns.find((c) => c.id === rule.columnId);
  if (
    !column ||
    ["is_empty", "is_not_empty", "checked", "unchecked"].includes(rule.operator)
  ) {
    return null;
  }
  if (
    column.type === ColumnType.Select ||
    column.type === ColumnType.MultiSelect
  ) {
    return (
      <Select
        disabled={!editable}
        value={String(rule.value ?? "")}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{t("Choose…")}</option>
        {(column.options ?? []).map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </Select>
    );
  }
  if (column.type === ColumnType.Person) {
    return (
      <Select
        disabled={!editable}
        value={String(rule.value ?? "")}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{t("Choose…")}</option>
        {users.active.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name}
          </option>
        ))}
      </Select>
    );
  }
  const numeric =
    column.type === ColumnType.Number || rule.operator === "next_days";
  return (
    <TextInput
      disabled={!editable}
      type={column.type === ColumnType.Date && !numeric ? "date" : "text"}
      inputMode={numeric ? "numeric" : undefined}
      value={String(rule.value ?? "")}
      placeholder={rule.operator === "next_days" ? "30" : t("Value")}
      onChange={(event) =>
        onChange(
          numeric && event.target.value !== ""
            ? Number(event.target.value.replace(",", "."))
            : event.target.value
        )
      }
    />
  );
});

function FilterButton() {
  const { t } = useTranslation();
  const { data, view, editable } = useDatabase();
  const updateView = useUpdateView();
  const labels = useOperatorLabels();

  const setRule = (index: number, patch: Partial<FilterRule>) =>
    updateView({
      filters: view.filters.map((rule, i) =>
        i === index ? { ...rule, ...patch } : rule
      ),
    });

  return (
    <Popover>
      <PopoverTrigger>
        <SmallButton type="button" $highlight={view.filters.length > 0}>
          <SearchIcon size={18} />
          {t("Filter")}
          {view.filters.length > 0 && ` · ${view.filters.length}`}
        </SmallButton>
      </PopoverTrigger>
      <PopoverContent width={520} shrink align="end" onClick={stop}>
        <PopoverBody>
          {view.filters.length === 0 && <Hint>{t("All rows are shown")}</Hint>}
          {view.filters.map((rule, index) => {
            const column = data.columns.find((c) => c.id === rule.columnId);
            return (
              <RuleRow key={`${rule.columnId}-${index}`}>
                <Select
                  disabled={!editable}
                  value={rule.columnId}
                  onChange={(event) => {
                    const next = data.columns.find(
                      (c) => c.id === event.target.value
                    );
                    if (next) {
                      setRule(index, {
                        columnId: next.id,
                        operator: operatorsFor(next.type)[0],
                        value: "",
                      });
                    }
                  }}
                >
                  {data.columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                <Select
                  disabled={!editable}
                  value={rule.operator}
                  onChange={(event) =>
                    setRule(index, {
                      operator: event.target.value as FilterOperator,
                    })
                  }
                >
                  {operatorsFor(column?.type ?? ColumnType.Text).map((op) => (
                    <option key={op} value={op}>
                      {labels[op]}
                    </option>
                  ))}
                </Select>
                <FilterValue
                  rule={rule}
                  onChange={(value) => setRule(index, { value })}
                />
                {editable && (
                  <IconButton
                    type="button"
                    aria-label={t("Remove")}
                    onClick={() =>
                      updateView({
                        filters: view.filters.filter((_, i) => i !== index),
                      })
                    }
                  >
                    <CloseIcon size={18} />
                  </IconButton>
                )}
              </RuleRow>
            );
          })}
          {editable && data.columns.length > 0 && (
            <MenuRow
              type="button"
              onClick={() =>
                updateView({
                  filters: [
                    ...view.filters,
                    {
                      columnId: data.columns[0].id,
                      operator: operatorsFor(data.columns[0].type)[0],
                      value: "",
                    },
                  ],
                })
              }
            >
              + {t("Add filter")}
            </MenuRow>
          )}
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}

function FieldsButton() {
  const { t } = useTranslation();
  const { data, view, editable } = useDatabase();
  const updateView = useUpdateView();
  const selectColumns = data.columns.filter((c) => c.type === ColumnType.Select);
  const dateColumns = data.columns.filter((c) => c.type === ColumnType.Date);

  return (
    <Popover>
      <PopoverTrigger>
        <SmallButton type="button">
          <EyeIcon size={18} />
          {t("Fields")}
        </SmallButton>
      </PopoverTrigger>
      <PopoverContent width={300} shrink align="end" onClick={stop}>
        <PopoverBody>
          {view.type === ViewType.Board && (
            <>
              <MenuLabel>{t("Group by")}</MenuLabel>
              {selectColumns.length ? (
                <Select
                  disabled={!editable}
                  value={view.groupBy ?? ""}
                  onChange={(event) => updateView({ groupBy: event.target.value })}
                >
                  <option value="" disabled>
                    {t("Choose…")}
                  </option>
                  {selectColumns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <Hint>{t("Add a select column to group cards")}</Hint>
              )}
              <MenuDivider />
            </>
          )}
          {view.type === ViewType.Calendar && (
            <>
              <MenuLabel>{t("Date")}</MenuLabel>
              {dateColumns.length ? (
                <Select
                  disabled={!editable}
                  value={view.dateColumn ?? ""}
                  onChange={(event) =>
                    updateView({ dateColumn: event.target.value })
                  }
                >
                  <option value="" disabled>
                    {t("Choose…")}
                  </option>
                  {dateColumns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <Hint>{t("Add a date column to use the calendar")}</Hint>
              )}
              <CheckRow>
                <input
                  type="checkbox"
                  disabled={!editable}
                  checked={!!view.recurring}
                  onChange={(event) =>
                    updateView({ recurring: event.target.checked })
                  }
                />
                {t("Repeat every year (birthdays)")}
              </CheckRow>
              <MenuDivider />
            </>
          )}
          <MenuLabel>{t("Shown fields")}</MenuLabel>
          {data.columns.map((column, index) => {
            const hidden = view.hidden.includes(column.id);
            return (
              <CheckRow key={column.id}>
                <input
                  type="checkbox"
                  disabled={!editable || index === 0}
                  checked={!hidden}
                  onChange={() =>
                    updateView({
                      hidden: hidden
                        ? view.hidden.filter((id) => id !== column.id)
                        : [...view.hidden, column.id],
                    })
                  }
                />
                <ColumnTypeIcon type={column.type} />
                {column.name}
              </CheckRow>
            );
          })}
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}

function DatabaseMenu() {
  const { t } = useTranslation();
  const { mutator } = useDatabase();
  const [confirm, setConfirm] = React.useState(false);
  return (
    <Popover onOpenChange={() => setConfirm(false)}>
      <PopoverTrigger>
        <SmallButton type="button" aria-label={t("More")}>
          <MoreIcon size={18} />
        </SmallButton>
      </PopoverTrigger>
      <PopoverContent width={240} shrink align="end" onClick={stop}>
        <PopoverBody>
          <MenuRow
            type="button"
            $danger
            onClick={() => (confirm ? mutator.deleteDatabase() : setConfirm(true))}
          >
            <TrashIcon size={18} />
            {confirm ? t("Click again to delete") : t("Delete database")}
          </MenuRow>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}

/** Title of the database, editable in place. */
export function DatabaseTitle() {
  const { t } = useTranslation();
  const { data, mutator, editable } = useDatabase();
  const [value, setValue] = React.useState(data.title);
  React.useEffect(() => setValue(data.title), [data.title]);
  const commit = () => {
    if (value !== data.title) {
      mutator.setAttrs({ title: value });
    }
  };
  return (
    <Title
      value={value}
      readOnly={!editable}
      placeholder={t("Untitled database")}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
    />
  );
}

const Bar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  padding: 4px 0;
  border-bottom: 1px solid ${s("divider")};
`;

const Tabs = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  flex-wrap: wrap;
`;

const Tab = styled.button<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 14px;
  background: ${(props) =>
    props.$active ? props.theme.listItemHoverBackground : "none"};
  color: ${(props) => (props.$active ? props.theme.text : props.theme.textSecondary)};
  font-size: 14px;
  font-weight: ${(props) => (props.$active ? 500 : 400)};
  cursor: pointer;

  &:hover {
    color: ${s("text")};
  }
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
`;

const RuleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;

  ${Select}, input {
    flex: 1;
    min-width: 0;
  }
`;

const IconButton = styled.button`
  display: flex;
  border: 0;
  background: none;
  color: ${s("textTertiary")};
  cursor: pointer;
  padding: 2px;

  &:hover {
    color: ${s("text")};
  }
`;

const Hint = styled.div`
  padding: 6px 8px;
  color: ${s("textTertiary")};
  font-size: 13px;
`;

const CheckRow = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  font-size: 14px;
  cursor: pointer;

  svg {
    flex-shrink: 0;
  }
`;

const Title = styled.input`
  width: 100%;
  border: 0;
  background: none;
  color: ${s("text")};
  font-size: 20px;
  font-weight: 600;
  padding: 4px 0;
  outline: none;

  &::placeholder {
    color: ${s("placeholder")};
  }
`;

