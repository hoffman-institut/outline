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
  EditIcon,
  ImageIcon,
  LinkIcon,
} from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type {
  FilterItem,
  FilterMode,
  FilterOperator,
  FilterRule,
  RowTemplate,
  SortRule,
  View,
} from "@shared/editor/lib/database";
import {
  ColumnType,
  ViewType,
  createView,
  isFilterGroup,
  newId,
  operatorsFor,
} from "@shared/editor/lib/database";
import {
  computeDatabase,
  linkedRows,
} from "@shared/editor/lib/databaseCompute";
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
    case ViewType.Form:
      return <EditIcon size={18} />;
    case ViewType.Gallery:
      return <ImageIcon size={18} />;
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
  onAddRow: (template?: RowTemplate) => void;
}) {
  const { t } = useTranslation();
  const { data, view, mutator, editable, search, setSearch } = useDatabase();
  const [addOpen, setAddOpen] = React.useState(false);

  // View tabs are dragged to reorder them.
  const dropView = (id: string, targetId: string, after: boolean) => {
    const moving = data.views.find((v) => v.id === id);
    if (!moving || id === targetId) {
      return;
    }
    const rest = data.views.filter((v) => v.id !== id);
    const index = rest.findIndex((v) => v.id === targetId);
    rest.splice(after ? index + 1 : index, 0, moving);
    mutator.setAttrs({ views: rest });
  };

  const viewTypes = [
    { type: ViewType.Table, label: t("Table") },
    { type: ViewType.Board, label: t("Board") },
    { type: ViewType.Calendar, label: t("Calendar") },
    { type: ViewType.Gallery, label: t("Gallery") },
    { type: ViewType.Form, label: t("Form") },
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
    setAddOpen(false);
  };

  return (
    <Bar>
      <Tabs>
        {data.views.map((v) => (
          <TabSlot
            key={v.id}
            draggable={editable}
            onDragStart={(event) => {
              event.dataTransfer.setData(VIEW_DRAG, v.id);
              event.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(event) => {
              if (Array.from(event.dataTransfer.types).includes(VIEW_DRAG)) {
                event.preventDefault();
              }
            }}
            onDrop={(event) => {
              const id = event.dataTransfer.getData(VIEW_DRAG);
              if (id) {
                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                dropView(id, v.id, event.clientX > rect.left + rect.width / 2);
              }
            }}
          >
            {v.id === view.id && editable ? (
              <ViewTabMenu current={v} onSelectView={onSelectView} />
            ) : (
              <Tab
                type="button"
                $active={v.id === view.id}
                onClick={() => onSelectView(v.id)}
              >
                <ViewIcon type={v.type} />
                {v.name}
              </Tab>
            )}
          </TabSlot>
        ))}
        {editable && (
          <Popover open={addOpen} onOpenChange={setAddOpen}>
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
        {view.type !== ViewType.Form && (
          <>
            <SearchInput
              type="search"
              placeholder={t("Search")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <SortButton />
            <FilterButton />
          </>
        )}
        <FieldsButton />
        {editable && view.type !== ViewType.Form && (
          <CreateButton onAddRow={onAddRow} />
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
          {current.type === ViewType.Form && (
            <MenuRow
              type="button"
              onClick={() => {
                const url = new URL(window.location.href);
                url.search = `?view=${current.id}`;
                url.hash = "";
                void navigator.clipboard?.writeText(url.toString());
                setOpen(false);
              }}
            >
              <LinkIcon size={18} />
              {t("Copy link to the form")}
            </MenuRow>
          )}
          <MenuRow
            type="button"
            onClick={() => {
              const copy = {
                ...current,
                id: newId(),
                name: `${current.name} 2`,
              };
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
  const { computed, view, editable } = useDatabase();
  const updateView = useUpdateView();
  const columns = computed.columns;

  const setRule = (index: number, patch: Partial<SortRule>) =>
    updateView({
      sort: view.sort.map((rule, i) =>
        i === index ? { ...rule, ...patch } : rule
      ),
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
          {!editable && <Hint>{t("Only you see these changes")}</Hint>}
          {view.sort.length === 0 && (
            <Hint>{t("No sorting: manual order")}</Hint>
          )}
          {view.sort.map((rule, index) => {
            const column = columns.find((c) => c.id === rule.columnId);
            return (
              <RuleRow key={`${rule.columnId}-${index}`}>
                <Select
                  value={rule.columnId}
                  onChange={(event) =>
                    setRule(index, {
                      columnId: event.target.value,
                      upcoming: false,
                    })
                  }
                >
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                <Select
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
                <IconButton
                  type="button"
                  aria-label={t("Remove")}
                  onClick={() =>
                    updateView({
                      sort: view.sort.filter((_, i) => i !== index),
                    })
                  }
                >
                  <CloseIcon size={18} />
                </IconButton>
              </RuleRow>
            );
          })}
          {columns.length > 0 && (
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
    today: t("is today"),
    this_week: t("this week"),
    this_month: t("this month"),
    last_days: t("in the last N days"),
    within_days: t("in the next N days"),
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
  const { computed, linked } = useDatabase();
  const { users } = useStores();
  const column = computed.columns.find((c) => c.id === rule.columnId);
  if (
    !column ||
    [
      "is_empty",
      "is_not_empty",
      "checked",
      "unchecked",
      "today",
      "this_week",
      "this_month",
    ].includes(rule.operator)
  ) {
    return null;
  }
  if (
    column.type === ColumnType.Select ||
    column.type === ColumnType.MultiSelect
  ) {
    return (
      <Select
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
  if (
    column.type === ColumnType.Relation ||
    column.type === ColumnType.Backlink
  ) {
    const target = column.relation ? linked.get(column.relation) : undefined;
    const options = target ? linkedRows(computeDatabase(target)) : [];
    return (
      <Select
        value={String(rule.value ?? "")}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{t("Choose…")}</option>
        {options.map((row) => (
          <option key={row.id} value={row.id}>
            {row.title || t("Untitled")}
          </option>
        ))}
      </Select>
    );
  }
  if (column.type === ColumnType.Person) {
    return (
      <Select
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
    column.type === ColumnType.Number ||
    column.type === ColumnType.AutoNumber ||
    ["next_days", "last_days", "within_days"].includes(rule.operator);
  return (
    <TextInput
      type={column.type === ColumnType.Date && !numeric ? "date" : "text"}
      inputMode={numeric ? "numeric" : undefined}
      value={String(rule.value ?? "")}
      placeholder={
        ["next_days", "last_days", "within_days"].includes(rule.operator)
          ? "30"
          : t("Value")
      }
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

/** One filter rule: column, condition, value. */
function FilterRuleRow({
  rule,
  onChange,
  onRemove,
}: {
  rule: FilterRule;
  onChange: (rule: FilterRule) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const { computed } = useDatabase();
  const labels = useOperatorLabels();
  const column = computed.columns.find((c) => c.id === rule.columnId);
  return (
    <RuleRow>
      <Select
        value={rule.columnId}
        onChange={(event) => {
          const next = computed.columns.find(
            (c) => c.id === event.target.value
          );
          if (next) {
            onChange({
              columnId: next.id,
              operator: operatorsFor(next.type)[0],
              value: "",
            });
          }
        }}
      >
        {computed.columns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Select
        value={rule.operator}
        onChange={(event) =>
          onChange({ ...rule, operator: event.target.value as FilterOperator })
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
        onChange={(value) => onChange({ ...rule, value })}
      />
      <IconButton type="button" aria-label={t("Remove")} onClick={onRemove}>
        <CloseIcon size={18} />
      </IconButton>
    </RuleRow>
  );
}

/** "All conditions" / "any condition" switch of a list of filters. */
function ModeSelect({
  mode,
  onChange,
}: {
  mode: FilterMode;
  onChange: (mode: FilterMode) => void;
}) {
  const { t } = useTranslation();
  return (
    <ModeRow>
      {t("Show rows that match")}
      <Select
        value={mode}
        onChange={(event) => onChange(event.target.value as FilterMode)}
      >
        <option value="and">{t("all conditions")}</option>
        <option value="or">{t("any condition")}</option>
      </Select>
    </ModeRow>
  );
}

function FilterButton() {
  const { t } = useTranslation();
  const { computed, view, editable } = useDatabase();
  const updateView = useUpdateView();
  const count = view.filters.reduce(
    (sum, item) => sum + (isFilterGroup(item) ? item.rules.length : 1),
    0
  );

  const newRule = (): FilterRule => ({
    columnId: computed.columns[0].id,
    operator: operatorsFor(computed.columns[0].type)[0],
    value: "",
  });
  const setItem = (index: number, item: FilterItem | null) =>
    updateView({
      filters: item
        ? view.filters.map((current, i) => (i === index ? item : current))
        : view.filters.filter((_, i) => i !== index),
    });

  return (
    <Popover>
      <PopoverTrigger>
        <SmallButton type="button" $highlight={count > 0}>
          <SearchIcon size={18} />
          {t("Filter")}
          {count > 0 && ` · ${count}`}
        </SmallButton>
      </PopoverTrigger>
      <PopoverContent width={580} shrink align="end" onClick={stop}>
        <PopoverBody>
          {!editable && <Hint>{t("Only you see these changes")}</Hint>}
          {view.filters.length === 0 && <Hint>{t("All rows are shown")}</Hint>}
          {view.filters.length > 1 && (
            <ModeSelect
              mode={view.filterMode ?? "and"}
              onChange={(filterMode) => updateView({ filterMode })}
            />
          )}
          {view.filters.map((item, index) =>
            isFilterGroup(item) ? (
              <GroupBox key={item.id}>
                {item.rules.length > 1 && (
                  <ModeSelect
                    mode={item.mode}
                    onChange={(mode) => setItem(index, { ...item, mode })}
                  />
                )}
                {item.rules.map((rule, ruleIndex) => (
                  <FilterRuleRow
                    key={ruleIndex}
                    rule={rule}
                    onChange={(next) =>
                      setItem(index, {
                        ...item,
                        rules: item.rules.map((r, i) =>
                          i === ruleIndex ? next : r
                        ),
                      })
                    }
                    onRemove={() => {
                      const rules = item.rules.filter(
                        (_, i) => i !== ruleIndex
                      );
                      setItem(index, rules.length ? { ...item, rules } : null);
                    }}
                  />
                ))}
                <MenuRow
                  type="button"
                  onClick={() =>
                    setItem(index, {
                      ...item,
                      rules: [...item.rules, newRule()],
                    })
                  }
                >
                  + {t("Add condition")}
                </MenuRow>
              </GroupBox>
            ) : (
              <FilterRuleRow
                key={index}
                rule={item}
                onChange={(next) => setItem(index, next)}
                onRemove={() => setItem(index, null)}
              />
            )
          )}
          {computed.columns.length > 0 && (
            <>
              <MenuRow
                type="button"
                onClick={() =>
                  updateView({ filters: [...view.filters, newRule()] })
                }
              >
                + {t("Add filter")}
              </MenuRow>
              <MenuRow
                type="button"
                onClick={() =>
                  updateView({
                    filters: [
                      ...view.filters,
                      { id: newId(), mode: "or", rules: [newRule()] },
                    ],
                  })
                }
              >
                + {t("Add filter group")}
              </MenuRow>
            </>
          )}
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}

function FieldsButton() {
  const { t } = useTranslation();
  const {
    data,
    computed,
    view,
    editable,
    updateView: saveView,
  } = useDatabase();
  const updateView = useUpdateView();
  const groupColumn = computed.columns.find((c) => c.id === view.groupBy);
  const selectColumns = data.columns.filter(
    (c) => c.type === ColumnType.Select
  );
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
                  value={view.groupBy ?? ""}
                  onChange={(event) =>
                    updateView({ groupBy: event.target.value })
                  }
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
          {view.type === ViewType.Table && (
            <>
              <MenuLabel>{t("Group by")}</MenuLabel>
              <Select
                value={groupColumn ? groupColumn.id : ""}
                onChange={(event) => {
                  if (event.target.value) {
                    updateView({ groupBy: event.target.value });
                  } else {
                    // Attributes are synced as JSON: drop the keys.
                    const { groupBy: _g, groupDate: _d, ...rest } = view;
                    saveView(rest);
                  }
                }}
              >
                <option value="">{t("No grouping")}</option>
                {computed.columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              {groupColumn?.type === ColumnType.Date && (
                <Select
                  value={view.groupDate ?? "month"}
                  onChange={(event) =>
                    updateView({
                      groupDate: event.target.value as View["groupDate"],
                    })
                  }
                >
                  <option value="day">{t("By day")}</option>
                  <option value="week">{t("By week")}</option>
                  <option value="month">{t("By month")}</option>
                  <option value="year">{t("By year")}</option>
                </Select>
              )}
              <MenuDivider />
            </>
          )}
          {view.type === ViewType.Gallery && (
            <>
              <MenuLabel>{t("Cover")}</MenuLabel>
              <Select
                value={view.coverColumn ?? ""}
                onChange={(event) =>
                  updateView({ coverColumn: event.target.value })
                }
              >
                <option value="">{t("First files column")}</option>
                {data.columns
                  .filter((c) => c.type === ColumnType.Files)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
              <MenuDivider />
            </>
          )}
          {view.type === ViewType.Calendar && (
            <>
              <MenuLabel>{t("Date")}</MenuLabel>
              {dateColumns.length ? (
                <Select
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
          {editable && view.type !== ViewType.Calendar && (
            <>
              <CheckRow>
                <input
                  type="checkbox"
                  checked={!!view.newRowsFirst}
                  onChange={(event) =>
                    updateView({ newRowsFirst: event.target.checked })
                  }
                />
                {t("New rows at the top")}
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
                  disabled={index === 0}
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

/** "New" button; with templates it offers them. */
function CreateButton({
  onAddRow,
}: {
  onAddRow: (template?: RowTemplate) => void;
}) {
  const { t } = useTranslation();
  const { data } = useDatabase();
  const [open, setOpen] = React.useState(false);
  const templates = data.templates ?? [];
  const label = (
    <>
      <PlusIcon size={18} />
      {t("New", { context: "database" })}
    </>
  );
  if (!templates.length) {
    return (
      <SmallButton type="button" onClick={() => onAddRow()}>
        {label}
      </SmallButton>
    );
  }
  const create = (template?: RowTemplate) => {
    setOpen(false);
    onAddRow(template);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <SmallButton type="button">{label}</SmallButton>
      </PopoverTrigger>
      <PopoverContent width={240} shrink align="end" onClick={stop}>
        <PopoverBody>
          <MenuRow type="button" onClick={() => create()}>
            {t("Empty row")}
          </MenuRow>
          <MenuLabel>{t("Templates")}</MenuLabel>
          {templates.map((template) => (
            <MenuRow
              key={template.id}
              type="button"
              onClick={() => create(template)}
            >
              {template.name || t("Untitled")}
            </MenuRow>
          ))}
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}

function DatabaseMenu() {
  const { t } = useTranslation();
  const { data, mutator } = useDatabase();
  const [confirm, setConfirm] = React.useState(false);
  const templates = data.templates ?? [];
  const saveTemplates = (next: RowTemplate[]) =>
    mutator.setAttrs({ templates: next });
  return (
    <Popover onOpenChange={() => setConfirm(false)}>
      <PopoverTrigger>
        <SmallButton type="button" aria-label={t("More")}>
          <MoreIcon size={18} />
        </SmallButton>
      </PopoverTrigger>
      <PopoverContent width={240} shrink align="end" onClick={stop}>
        <PopoverBody>
          <MenuLabel>{t("Templates")}</MenuLabel>
          {templates.length === 0 && (
            <Hint>{t("Save a row as a template from its menu")}</Hint>
          )}
          {templates.map((template) => (
            <RuleRow key={template.id}>
              <TextInput
                defaultValue={template.name}
                onBlur={(event) => {
                  const name = event.target.value.trim();
                  if (name && name !== template.name) {
                    saveTemplates(
                      templates.map((item) =>
                        item.id === template.id ? { ...item, name } : item
                      )
                    );
                  }
                }}
              />
              <IconButton
                type="button"
                aria-label={t("Delete")}
                onClick={() =>
                  saveTemplates(
                    templates.filter((item) => item.id !== template.id)
                  )
                }
              >
                <CloseIcon size={18} />
              </IconButton>
            </RuleRow>
          ))}
          <MenuDivider />
          <MenuRow
            type="button"
            $danger
            onClick={() =>
              confirm ? mutator.deleteDatabase() : setConfirm(true)
            }
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
  color: ${(props) =>
    props.$active ? props.theme.text : props.theme.textSecondary};
  font-size: 14px;
  font-weight: ${(props) => (props.$active ? 500 : 400)};
  cursor: pointer;

  &:hover {
    color: ${s("text")};
  }
`;

const VIEW_DRAG = "text/x-database-view";

const TabSlot = styled.span`
  display: inline-flex;
`;

const SearchInput = styled.input`
  width: 140px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid ${s("inputBorder")};
  border-radius: 6px;
  background: none;
  color: ${s("text")};
  font-size: 13px;
  outline: none;

  &:focus {
    border-color: ${s("accent")};
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

const ModeRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0 6px;
  color: ${s("textSecondary")};
  font-size: 13px;

  ${Select} {
    width: auto;
  }
`;

const GroupBox = styled.div`
  margin: 4px 0;
  padding: 6px 8px;
  border: 1px solid ${s("divider")};
  border-radius: 6px;
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
