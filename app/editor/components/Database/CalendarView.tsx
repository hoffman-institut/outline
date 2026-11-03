import { BackIcon, NextIcon, PlusIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled, { css } from "styled-components";
import type { Row } from "@shared/editor/lib/database";
import {
  ColumnType,
  displayValue,
  parseDateValue,
  todayValue,
} from "@shared/editor/lib/database";
import { s } from "@shared/styles";
import useUserLocale from "~/hooks/useUserLocale";
import { SmallButton } from "./components";
import { useDatabase } from "./context";

const isLeapYear = (year: number) =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** Month calendar that places rows on the days of a date column. */
export function CalendarView({ rows }: { rows: Row[] }) {
  const { t } = useTranslation();
  const locale = (useUserLocale() ?? "ru_RU").replace("_", "-");
  const { data, view, editable, mutator, openRow } = useDatabase();
  const now = new Date();
  const [cursor, setCursor] = React.useState({
    year: now.getFullYear(),
    month: now.getMonth(),
  });
  const dateColumn = data.columns.find(
    (c) => c.id === view.dateColumn && c.type === ColumnType.Date
  );
  const titleColumn = data.columns[0];

  if (!dateColumn) {
    return <Notice>{t("Choose a date column in “Fields”.")}</Notice>;
  }

  const first = new Date(cursor.year, cursor.month, 1);
  const offset = (first.getDay() + 6) % 7; // Monday first
  const days = Array.from(
    { length: 42 },
    (_, i) => new Date(cursor.year, cursor.month, 1 - offset + i)
  );
  const today = todayValue();

  const rowsOn = (day: Date) =>
    rows.filter((row) => {
      const date = parseDateValue(row.cells[dateColumn.id]);
      if (!date) {
        return false;
      }
      const m = day.getMonth() + 1;
      const d = day.getDate();
      if (!view.recurring) {
        return date.year === day.getFullYear() && date.month === m && date.day === d;
      }
      if (date.month === m && date.day === d) {
        return true;
      }
      // 29 February anniversaries fall on 28 February in common years.
      return (
        date.month === 2 &&
        date.day === 29 &&
        m === 2 &&
        d === 28 &&
        !isLeapYear(day.getFullYear())
      );
    });

  const shift = (delta: number) =>
    setCursor(({ year, month }) => {
      const next = new Date(year, month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });

  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: "short" }).format(
      new Date(2024, 0, 1 + i) // 1 January 2024 is a Monday
    )
  );

  return (
    <Wrapper>
      <Nav>
        <MonthTitle>
          {new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(first)}
        </MonthTitle>
        <SmallButton type="button" aria-label={t("Previous month")} onClick={() => shift(-1)}>
          <BackIcon size={18} />
        </SmallButton>
        <SmallButton
          type="button"
          onClick={() => setCursor({ year: now.getFullYear(), month: now.getMonth() })}
        >
          {t("Today")}
        </SmallButton>
        <SmallButton type="button" aria-label={t("Next month")} onClick={() => shift(1)}>
          <NextIcon size={18} />
        </SmallButton>
      </Nav>
      <Grid>
        {weekdays.map((name) => (
          <Weekday key={name}>{name}</Weekday>
        ))}
        {days.map((day) => {
          const key = todayValue(day);
          const entries = rowsOn(day);
          return (
            <Day
              key={key}
              $outside={day.getMonth() !== cursor.month}
              $today={key === today}
            >
              <DayHeader>
                <DayNumber>{day.getDate()}</DayNumber>
                {editable && (
                  <AddButton
                    type="button"
                    aria-label={t("New", { context: "database" })}
                    onClick={() => mutator.addRow({ [dateColumn.id]: key })}
                  >
                    <PlusIcon size={14} />
                  </AddButton>
                )}
              </DayHeader>
              {entries.map((row) => (
                <Entry key={row.id} type="button" onClick={() => openRow(row.id)}>
                  {(titleColumn && displayValue(titleColumn, row.cells[titleColumn.id])) ||
                    t("Untitled")}
                </Entry>
              ))}
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
  text-transform: capitalize;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
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

const Day = styled.div<{ $outside: boolean; $today: boolean }>`
  min-height: 92px;
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
