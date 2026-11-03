import { BackIcon, NextIcon, PlusIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled, { css } from "styled-components";
import type { Row, View } from "@shared/editor/lib/database";
import {
  ColumnType,
  displayValue,
  parseDateValue,
  timeOf,
  todayValue,
} from "@shared/editor/lib/database";
import { s } from "@shared/styles";
import useUserLocale from "~/hooks/useUserLocale";
import { SmallButton } from "./components";
import { useDatabase, useUpdateView } from "./context";

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

const isLeapYear = (year: number) =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

type CalendarMode = NonNullable<View["calendarMode"]>;

/** Calendar of a month, a week or a day, with rows on their dates. */
export function CalendarView({ rows }: { rows: Row[] }) {
  const { t } = useTranslation();
  const locale = (useUserLocale() ?? "ru_RU").replace("_", "-");
  const { data, computed, view, editable, openRow, addRow } = useDatabase();
  const updateView = useUpdateView();
  const [cursor, setCursor] = React.useState(() => new Date());
  const mode: CalendarMode = view.calendarMode ?? "month";
  const dateColumn = data.columns.find(
    (c) => c.id === view.dateColumn && c.type === ColumnType.Date
  );
  const titleColumn = computed.columns[0];

  if (!dateColumn) {
    return <Notice>{t("Choose a date column in “Fields”.")}</Notice>;
  }

  const today = todayValue();
  const day = (offset: number, from = cursor) =>
    new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset);
  const monday = day(-((cursor.getDay() + 6) % 7));
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const days =
    mode === "day"
      ? [cursor]
      : mode === "week"
        ? Array.from({ length: 7 }, (_, i) => day(i, monday))
        : Array.from({ length: 42 }, (_, i) =>
            day(i - ((first.getDay() + 6) % 7), first)
          );

  // Rows of a day; rows with a time are ordered by it, after all-day rows.
  const rowsOn = (date: Date) =>
    rows
      .filter((row) => {
        const value = parseDateValue(row.cells[dateColumn.id]);
        if (!value) {
          return false;
        }
        const m = date.getMonth() + 1;
        const d = date.getDate();
        if (!view.recurring) {
          return (
            value.year === date.getFullYear() &&
            value.month === m &&
            value.day === d
          );
        }
        if (value.month === m && value.day === d) {
          return true;
        }
        // 29 February anniversaries fall on 28 February in common years.
        return (
          value.month === 2 &&
          value.day === 29 &&
          m === 2 &&
          d === 28 &&
          !isLeapYear(date.getFullYear())
        );
      })
      .sort((a, b) =>
        (timeOf(a.cells[dateColumn.id]) ?? "").localeCompare(
          timeOf(b.cells[dateColumn.id]) ?? ""
        )
      );

  const format = (date: Date, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, options).format(date);
  // Russian "ноябрь 2026 г.": capitalize the month only, not "г.".
  const title =
    mode === "day"
      ? format(cursor, {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : mode === "week"
        ? `${format(monday, { day: "numeric", month: "short" })} — ${format(
            day(6, monday),
            { day: "numeric", month: "short", year: "numeric" }
          )}`
        : format(first, { month: "long", year: "numeric" });

  const shift = (delta: number) =>
    setCursor((current) =>
      mode === "month"
        ? new Date(current.getFullYear(), current.getMonth() + delta, 1)
        : day(delta * (mode === "week" ? 7 : 1), current)
    );

  const weekdays = Array.from(
    { length: 7 },
    (_, i) => format(new Date(2024, 0, 1 + i), { weekday: "short" }) // 1.1.2024: Monday
  );

  const entry = (row: Row) => {
    const time = timeOf(row.cells[dateColumn.id]);
    const name =
      (titleColumn && displayValue(titleColumn, row.cells[titleColumn.id])) ||
      t("Untitled");
    return (
      <Entry key={row.id} type="button" onClick={() => openRow(row.id)}>
        {time && <Time>{time}</Time>}
        {name}
      </Entry>
    );
  };

  return (
    <Wrapper>
      <Nav>
        <MonthTitle>{capitalize(title)}</MonthTitle>
        <Modes>
          {(["month", "week", "day"] as CalendarMode[]).map((item) => (
            <SmallButton
              key={item}
              type="button"
              $highlight={item === mode}
              onClick={() => updateView({ calendarMode: item })}
            >
              {item === "month"
                ? t("Month")
                : item === "week"
                  ? t("Week")
                  : t("Day")}
            </SmallButton>
          ))}
        </Modes>
        <SmallButton
          type="button"
          aria-label={t("Previous")}
          onClick={() => shift(-1)}
        >
          <BackIcon size={18} />
        </SmallButton>
        <SmallButton type="button" onClick={() => setCursor(new Date())}>
          {t("Today")}
        </SmallButton>
        <SmallButton
          type="button"
          aria-label={t("Next")}
          onClick={() => shift(1)}
        >
          <NextIcon size={18} />
        </SmallButton>
      </Nav>
      <Grid $columns={mode === "day" ? 1 : 7}>
        {mode !== "day" &&
          weekdays.map((name) => <Weekday key={name}>{name}</Weekday>)}
        {days.map((date) => {
          const key = todayValue(date);
          return (
            <Day
              key={key}
              $outside={
                mode === "month" && date.getMonth() !== first.getMonth()
              }
              $today={key === today}
              $tall={mode !== "month"}
            >
              <DayHeader>
                <DayNumber>{date.getDate()}</DayNumber>
                {editable && (
                  <AddButton
                    type="button"
                    aria-label={t("New", { context: "database" })}
                    onClick={() => addRow({ [dateColumn.id]: key })}
                  >
                    <PlusIcon size={14} />
                  </AddButton>
                )}
              </DayHeader>
              {rowsOn(date).map(entry)}
            </Day>
          );
        })}
      </Grid>
    </Wrapper>
  );
}

const Wrapper = styled.div`
  padding: 8px 0 12px;
`;

const Nav = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
`;

const MonthTitle = styled.div`
  font-size: 16px;
  font-weight: 600;
  margin-right: auto;
`;

const Modes = styled.div`
  display: flex;
  gap: 2px;
  margin-right: 8px;
`;

const Time = styled.span`
  margin-right: 4px;
  color: ${s("textTertiary")};
`;

const Grid = styled.div<{ $columns: number }>`
  display: grid;
  grid-template-columns: repeat(${(props) => props.$columns}, minmax(0, 1fr));
  border-left: 1px solid ${s("divider")};
  border-top: 1px solid ${s("divider")};
`;

const Weekday = styled.div`
  padding: 4px 6px;
  border-right: 1px solid ${s("divider")};
  border-bottom: 1px solid ${s("divider")};
  color: ${s("textTertiary")};
  font-size: 12px;
  text-transform: uppercase;
`;

const AddButton = styled.button`
  display: flex;
  border: 0;
  background: none;
  color: ${s("textTertiary")};
  cursor: pointer;
  padding: 0;
  opacity: 0;
`;

const Day = styled.div<{ $outside: boolean; $today: boolean; $tall: boolean }>`
  min-height: ${(props) => (props.$tall ? 240 : 92)}px;
  padding: 4px;
  border-right: 1px solid ${s("divider")};
  border-bottom: 1px solid ${s("divider")};
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  ${(props) =>
    props.$outside &&
    css`
      background: ${props.theme.backgroundSecondary};
      opacity: 0.7;
    `}

  &:hover ${AddButton} {
    opacity: 1;
  }

  ${(props) =>
    props.$today &&
    css`
      ${DayNumber} {
        background: ${props.theme.accent};
        color: white;
      }
    `}
`;

const DayHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const DayNumber = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  border-radius: 11px;
  font-size: 12px;
`;

const Entry = styled.button`
  display: block;
  width: 100%;
  padding: 2px 6px;
  border: 0;
  border-radius: 4px;
  background: ${s("listItemHoverBackground")};
  color: ${s("text")};
  font-size: 12px;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
`;

const Notice = styled.div`
  padding: 16px 8px;
  color: ${s("textTertiary")};
  font-size: 14px;
`;
