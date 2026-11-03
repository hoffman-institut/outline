import {
  BackIcon,
  NextIcon,
  CalendarIcon,
  CheckboxIcon,
  CollapseIcon,
  EmailIcon,
  EyeIcon,
  HashtagIcon,
  InputIcon,
  InsertLeftIcon,
  InsertRightIcon,
  LinkIcon,
  BulletedListIcon,
  GoToIcon,
  MathIcon,
  OrderedListIcon,
  ReturnIcon,
  SummaryIcon,
  KeyboardIcon,
  SortAscendingIcon,
  SortDescendingIcon,
  TrashIcon,
  UserIcon,
  ClockIcon,
} from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type {
  CellValue,
  Column,
  NumberFormat,
  SelectOption,
} from "@shared/editor/lib/database";
import {
  ColumnType,
  convertValue,
  moveColumn,
  newId,
  nextOptionColor,
  isFilterGroup,
  numberFormats,
  optionNamesFor,
} from "@shared/editor/lib/database";
import { calculatedTypes } from "@shared/editor/lib/databaseCompute";
import { renameFormulaRef } from "@shared/editor/lib/formula";
import { s } from "@shared/styles";
import { FormulaEditor } from "./FormulaEditor";
import { BacklinkEditor, RelationEditor, RollupEditor } from "./LinkEditors";
import {
  ColorPicker,
  Chip,
  MenuDivider,
  MenuLabel,
  MenuRow,
  Select,
  TextInput,
} from "./components";
import { useDatabase, useUpdateView } from "./context";

export function useColumnTypes() {
  const { t } = useTranslation();
  return React.useMemo(
    () => [
      {
        type: ColumnType.Text,
        label: t("Text"),
        icon: <InputIcon size={18} />,
      },
      {
        type: ColumnType.Number,
        label: t("Number"),
        icon: <HashtagIcon size={18} />,
      },
      {
        type: ColumnType.Select,
        label: t("Select", { context: "database" }),
        icon: <CollapseIcon size={18} />,
      },
      {
        type: ColumnType.MultiSelect,
        label: t("Multi-select"),
        icon: <BulletedListIcon size={18} />,
      },
      {
        type: ColumnType.Date,
        label: t("Date"),
        icon: <CalendarIcon size={18} />,
      },
      {
        type: ColumnType.Person,
        label: t("Person"),
        icon: <UserIcon size={18} />,
      },
      {
        type: ColumnType.Checkbox,
        label: t("Checkbox"),
        icon: <CheckboxIcon checked size={18} />,
      },
      { type: ColumnType.Url, label: t("URL"), icon: <LinkIcon size={18} /> },
      {
        type: ColumnType.Email,
        label: t("Email"),
        icon: <EmailIcon size={18} />,
      },
      {
        type: ColumnType.Phone,
        label: t("Phone"),
        icon: <KeyboardIcon size={18} />,
      },
      {
        type: ColumnType.Formula,
        label: t("Formula"),
        icon: <MathIcon size={18} />,
      },
      {
        type: ColumnType.Relation,
        label: t("Relation"),
        icon: <GoToIcon size={18} />,
      },
      {
        type: ColumnType.Backlink,
        label: t("Backlink"),
        icon: <ReturnIcon size={18} />,
      },
      {
        type: ColumnType.Rollup,
        label: t("Rollup"),
        icon: <SummaryIcon size={18} />,
      },
      {
        type: ColumnType.AutoNumber,
        label: t("Auto number"),
        icon: <OrderedListIcon size={18} />,
      },
    ],
    [t]
  );
}

export function ColumnTypeIcon({ type }: { type: ColumnType }) {
  const types = useColumnTypes();
  return types.find((item) => item.type === type)?.icon ?? null;
}

const isSelectType = (type: ColumnType) =>
  type === ColumnType.Select || type === ColumnType.MultiSelect;

/** Header menu of a column: name, type, options, sort, hide, insert, delete. */
export function ColumnMenu({
  column,
  onClose,
}: {
  column: Column;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data, computed, view, mutator } = useDatabase();
  const updateView = useUpdateView();
  const types = useColumnTypes();
  const [name, setName] = React.useState(column.name);
  const [showTypes, setShowTypes] = React.useState(false);
  const index = data.columns.findIndex((c) => c.id === column.id);

  const setColumns = (
    columns: Column[],
    transform?: (
      cells: Record<string, CellValue>,
      rowId: string
    ) => Record<string, CellValue>
  ) => mutator.setColumns(columns, transform);

  // Renaming also updates the formulas that use the column.
  const rename = () => {
    const next = name.trim();
    if (next && next !== column.name) {
      setColumns(
        data.columns.map((c) =>
          c.id === column.id
            ? { ...c, name: next }
            : c.formula
              ? {
                  ...c,
                  formula: renameFormulaRef(c.formula, column.name, next),
                }
              : c
        )
      );
    }
  };

  const changeType = (type: ColumnType) => {
    setShowTypes(false);
    if (type === column.type) {
      return;
    }
    const next: Column = { id: column.id, name: column.name, type };
    if (column.width) {
      next.width = column.width;
    }
    if (calculatedTypes.includes(type)) {
      // Stored values are replaced by calculated ones.
      if (type === ColumnType.Formula) {
        next.formula = "";
      }
      setColumns(
        data.columns.map((c) => (c.id === column.id ? next : c)),
        (cells) => {
          const { [column.id]: _removed, ...rest } = cells;
          return rest;
        }
      );
      return;
    }
    if (type === ColumnType.AutoNumber) {
      // Existing rows are numbered in their order, new rows get the next one.
      let number = 0;
      setColumns(
        data.columns.map((c) => (c.id === column.id ? next : c)),
        (cells) => ({ ...cells, [column.id]: ++number })
      );
      return;
    }
    // Calculated columns keep their current results as values, relations
    // the titles of the linked rows.
    const isLink =
      column.type === ColumnType.Relation ||
      column.type === ColumnType.Backlink;
    const isCalculated = calculatedTypes.includes(column.type);
    const from: Column = isLink
      ? { ...column, type: ColumnType.Text }
      : (computed.columns.find((c) => c.id === column.id) ?? column);
    const shownValue = (rowId: string): CellValue | undefined => {
      const row = computed.rows.find((r) => r.id === rowId);
      return isLink
        ? (row?.links?.[column.id] ?? [])
            .map((link) => link.title)
            .filter(Boolean)
            .join(", ")
        : row?.cells[column.id];
    };
    const valueOf = (rowId: string, cells: Record<string, CellValue>) =>
      isLink || isCalculated ? shownValue(rowId) : cells[column.id];
    const fromRows =
      isLink || isCalculated
        ? data.rows.map((row) => ({
            ...row,
            cells: { ...row.cells, [column.id]: shownValue(row.id) ?? null },
          }))
        : data.rows;
    if (isSelectType(type)) {
      if (isSelectType(column.type)) {
        next.options = column.options ?? [];
      } else {
        const options: SelectOption[] = [];
        for (const optionName of optionNamesFor(from, fromRows)) {
          options.push({
            id: newId(),
            name: optionName,
            color: nextOptionColor(options),
          });
        }
        next.options = options;
      }
    }
    setColumns(
      data.columns.map((c) => (c.id === column.id ? next : c)),
      (cells, rowId) => ({
        ...cells,
        [column.id]: convertValue(from, next, valueOf(rowId, cells)),
      })
    );
  };

  const insert = (offset: 0 | 1) => {
    const added: Column = {
      id: newId(),
      name: t("Column"),
      type: ColumnType.Text,
    };
    const columns = [...data.columns];
    columns.splice(index + offset, 0, added);
    setColumns(columns);
    onClose();
  };

  const remove = () => {
    setColumns(
      data.columns.filter((c) => c.id !== column.id),
      (cells) => {
        const { [column.id]: _removed, ...rest } = cells;
        return rest;
      }
    );
    // Clean the views from references to the deleted column.
    // Attributes are synced as JSON, so drop keys instead of storing undefined.
    for (const v of data.views) {
      const { groupBy, dateColumn, ...rest } = v;
      mutator.setView({
        ...rest,
        sort: v.sort.filter((rule) => rule.columnId !== column.id),
        filters: v.filters
          .map((item) =>
            isFilterGroup(item)
              ? {
                  ...item,
                  rules: item.rules.filter((r) => r.columnId !== column.id),
                }
              : item
          )
          .filter((item) =>
            isFilterGroup(item)
              ? item.rules.length > 0
              : item.columnId !== column.id
          ),
        hidden: v.hidden.filter((id) => id !== column.id),
        ...(groupBy && groupBy !== column.id ? { groupBy } : {}),
        ...(dateColumn && dateColumn !== column.id ? { dateColumn } : {}),
      });
    }
    onClose();
  };

  const sort = (direction: "asc" | "desc", upcoming?: boolean) => {
    updateView({
      sort: [
        { columnId: column.id, direction, ...(upcoming ? { upcoming } : {}) },
      ],
    });
    onClose();
  };

  const current = types.find((item) => item.type === column.type);
  const valueType =
    computed.columns.find((c) => c.id === column.id)?.type ?? column.type;

  return (
    <Body>
      <TextInput
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={rename}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            rename();
            onClose();
          }
        }}
      />
      <MenuRow type="button" onClick={() => setShowTypes(!showTypes)}>
        {current?.icon}
        {t("Type")}: {current?.label}
      </MenuRow>
      {showTypes &&
        types.map((item) => (
          <MenuRow
            key={item.type}
            type="button"
            $active={item.type === column.type}
            onClick={() => changeType(item.type)}
          >
            {item.icon}
            {item.label}
          </MenuRow>
        ))}
      {isSelectType(column.type) && <OptionsEditor column={column} />}
      {column.type === ColumnType.Formula && <FormulaEditor column={column} />}
      {column.type === ColumnType.Relation && (
        <RelationEditor column={column} />
      )}
      {column.type === ColumnType.Backlink && (
        <BacklinkEditor column={column} />
      )}
      {column.type === ColumnType.Rollup && <RollupEditor column={column} />}
      {valueType === ColumnType.Number && (
        <NumberFormatEditor column={column} />
      )}
      {column.type === ColumnType.AutoNumber && (
        <PrefixEditor column={column} />
      )}
      <MenuDivider />
      {valueType === ColumnType.Date && (
        <MenuRow type="button" onClick={() => sort("asc", true)}>
          <ClockIcon size={18} />
          {t("Nearest dates first (birthdays)")}
        </MenuRow>
      )}
      <MenuRow type="button" onClick={() => sort("asc")}>
        <SortAscendingIcon size={18} />
        {t("Sort ascending")}
      </MenuRow>
      <MenuRow type="button" onClick={() => sort("desc")}>
        <SortDescendingIcon size={18} />
        {t("Sort descending")}
      </MenuRow>
      {view.hidden.length < data.columns.length - 1 && (
        <MenuRow
          type="button"
          onClick={() => {
            updateView({ hidden: [...view.hidden, column.id] });
            onClose();
          }}
        >
          <EyeIcon size={18} />
          {t("Hide in this view")}
        </MenuRow>
      )}
      {index > 0 && (
        <MenuRow
          type="button"
          onClick={() => {
            setColumns(
              moveColumn(
                data.columns,
                column.id,
                data.columns[index - 1].id,
                false
              )
            );
            onClose();
          }}
        >
          <BackIcon size={18} />
          {t("Move left")}
        </MenuRow>
      )}
      {index < data.columns.length - 1 && (
        <MenuRow
          type="button"
          onClick={() => {
            setColumns(
              moveColumn(
                data.columns,
                column.id,
                data.columns[index + 1].id,
                true
              )
            );
            onClose();
          }}
        >
          <NextIcon size={18} />
          {t("Move right")}
        </MenuRow>
      )}
      <MenuRow type="button" onClick={() => insert(0)}>
        <InsertLeftIcon size={18} />
        {t("Insert column before")}
      </MenuRow>
      <MenuRow type="button" onClick={() => insert(1)}>
        <InsertRightIcon size={18} />
        {t("Insert column after")}
      </MenuRow>
      {data.columns.length > 1 && (
        <MenuRow type="button" $danger onClick={remove}>
          <TrashIcon size={18} />
          {t("Delete column")}
        </MenuRow>
      )}
    </Body>
  );
}

/** Display format of a number column (or a formula, a rollup with numbers). */
function NumberFormatEditor({ column }: { column: Column }) {
  const { t } = useTranslation();
  const { data, mutator } = useDatabase();
  const labels: Record<NumberFormat, string> = {
    plain: t("As typed"),
    grouped: t("With thousands separators"),
    ruble: t("Rubles"),
    dollar: t("Dollars"),
    euro: t("Euros"),
    percent: t("Percent"),
  };
  const save = (patch: Pick<Column, "numberFormat" | "showAs" | "max">) =>
    mutator.setColumns(
      data.columns.map((c) => {
        if (c.id !== column.id) {
          return c;
        }
        // Attributes are synced as JSON, so drop keys instead of undefined.
        const next: Column = { ...c, ...patch };
        if (!next.numberFormat) {
          delete next.numberFormat;
        }
        if (!next.showAs) {
          delete next.showAs;
        }
        return next;
      })
    );
  return (
    <>
      <MenuLabel>{t("Number format")}</MenuLabel>
      <Select
        value={column.numberFormat ?? "plain"}
        onChange={(event) => {
          const value = event.target.value as NumberFormat;
          save({ numberFormat: value === "plain" ? undefined : value });
        }}
      >
        {numberFormats.map((format) => (
          <option key={format} value={format}>
            {labels[format]}
          </option>
        ))}
      </Select>
      {column.type === ColumnType.Number && (
        <BarRow>
          <input
            type="checkbox"
            checked={column.showAs === "bar"}
            onChange={(event) =>
              save({ showAs: event.target.checked ? "bar" : undefined })
            }
          />
          {t("Show as a bar, maximum")}
          <TextInput
            type="number"
            min={1}
            disabled={column.showAs !== "bar"}
            defaultValue={column.max ?? 100}
            onBlur={(event) => {
              const max = Number(event.target.value);
              if (max > 0 && max !== (column.max ?? 100)) {
                save({ max });
              }
            }}
          />
        </BarRow>
      )}
    </>
  );
}

/** Text before the numbers of an auto number column, e.g. "TASK-". */
function PrefixEditor({ column }: { column: Column }) {
  const { t } = useTranslation();
  const { data, mutator } = useDatabase();
  return (
    <>
      <MenuLabel>{t("Prefix")}</MenuLabel>
      <TextInput
        placeholder="TASK-"
        defaultValue={column.prefix ?? ""}
        onBlur={(event) => {
          const prefix = event.target.value;
          if (prefix !== (column.prefix ?? "")) {
            mutator.setColumns(
              data.columns.map((c) =>
                c.id === column.id ? { ...c, prefix } : c
              )
            );
          }
        }}
      />
    </>
  );
}

/** Edits the options of a select column: names, colors, order, deletion. */
export function OptionsEditor({ column }: { column: Column }) {
  const { t } = useTranslation();
  const { data, mutator } = useDatabase();
  const [editing, setEditing] = React.useState<string | null>(null);
  const options = column.options ?? [];

  const save = (
    nextOptions: SelectOption[],
    transform?: (cells: Record<string, CellValue>) => Record<string, CellValue>
  ) =>
    mutator.setColumns(
      data.columns.map((c) =>
        c.id === column.id ? { ...c, options: nextOptions } : c
      ),
      transform
    );

  const update = (id: string, patch: Partial<SelectOption>) =>
    save(options.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  const remove = (id: string) =>
    save(
      options.filter((o) => o.id !== id),
      (cells) => {
        const value = cells[column.id];
        return {
          ...cells,
          [column.id]: Array.isArray(value)
            ? value.filter((v) => v !== id)
            : value === id
              ? null
              : value,
        };
      }
    );

  const move = (id: string, delta: -1 | 1) => {
    const from = options.findIndex((o) => o.id === id);
    const to = from + delta;
    if (to < 0 || to >= options.length) {
      return;
    }
    const next = [...options];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    save(next);
  };

  return (
    <>
      <MenuLabel>{t("Options", { context: "database" })}</MenuLabel>
      {options.map((option) =>
        editing === option.id ? (
          <OptionEdit key={option.id}>
            <TextInput
              autoFocus
              defaultValue={option.name}
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (value && value !== option.name) {
                  update(option.id, { name: value });
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                  setEditing(null);
                }
              }}
            />
            <ColorPicker
              value={option.color}
              onChange={(color) => update(option.id, { color })}
            />
            <OptionActions>
              <MiniButton type="button" onClick={() => move(option.id, -1)}>
                ↑
              </MiniButton>
              <MiniButton type="button" onClick={() => move(option.id, 1)}>
                ↓
              </MiniButton>
              <MiniButton type="button" onClick={() => remove(option.id)}>
                {t("Delete")}
              </MiniButton>
              <MiniButton type="button" onClick={() => setEditing(null)}>
                {t("Done")}
              </MiniButton>
            </OptionActions>
          </OptionEdit>
        ) : (
          <MenuRow
            key={option.id}
            type="button"
            onClick={() => setEditing(option.id)}
          >
            <Chip option={option} />
          </MenuRow>
        )
      )}
      <MenuRow
        type="button"
        onClick={() => {
          const option: SelectOption = {
            id: newId(),
            name: t("Option {{ number }}", { number: options.length + 1 }),
            color: nextOptionColor(options),
          };
          save([...options, option]);
          setEditing(option.id);
        }}
      >
        + {t("Add option")}
      </MenuRow>
    </>
  );
}

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
`;

const BarRow = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  font-size: 14px;

  input[type="number"] {
    width: 72px;
  }
`;

const OptionEdit = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  border: 1px solid ${s("divider")};
  border-radius: 6px;
`;

const OptionActions = styled.div`
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
`;

const MiniButton = styled.button`
  padding: 2px 8px;
  border: 1px solid ${s("divider")};
  border-radius: 4px;
  background: none;
  color: ${s("textSecondary")};
  font-size: 13px;
  cursor: pointer;

  &:hover {
    color: ${s("text")};
  }
`;
