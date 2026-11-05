import { BackIcon, NextIcon } from "outline-icons";
import { transparentize } from "polished";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled, { css, useTheme } from "styled-components";
import type { Column, TimelineScale } from "@shared/editor/lib/database";
import {
  ColumnType,
  dayNumber,
  displayValue,
  formatDate,
  optionPalette,
  timelineScales,
  todayValue,
} from "@shared/editor/lib/database";
import type { ComputedRow } from "@shared/editor/lib/databaseCompute";
import type { DayRange, TimelineItem } from "@shared/editor/lib/timeline";
import {
  dayKeyOf,
  dayKind,
  dayRuns,
  monthSpans,
  parseProductionCalendar,
  shiftPeriod,
  timelineLayout,
  timelineRange,
  weekdayOf,
} from "@shared/editor/lib/timeline";
import { s } from "@shared/styles";
import useUserLocale from "~/hooks/useUserLocale";
import { client } from "~/utils/ApiClient";
import { SmallButton } from "./components";
import { useDatabase, useUpdateView } from "./context";

/** Height of one line of a lane, px. */
const LINE = 24;

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

// Production calendars by year, shared by the timelines of the page.
const calendars = new Map<number, Promise<string | undefined>>();

/**
 * Loads the production calendar of a year from the server. Without it days
 * off are Saturdays and Sundays: when the service is down the server says
 * so and the next period asks again; a failed request (a public share
 * without signing in) is not repeated until the page is reloaded.
 */
function loadCalendar(year: number): Promise<string | undefined> {
  let promise = calendars.get(year);
  if (!promise) {
    promise = client
      .post("/calendar.holidays", { year })
      .then((res) => {
        if (res.data?.source !== "isdayoff") {
          calendars.delete(year);
          return undefined;
        }
        return parseProductionCalendar(String(res.data.days ?? ""), year);
      })
      .catch(() => undefined);
    calendars.set(year, promise);
  }
  return promise;
}

function useProductionCalendars(range: DayRange) {
  const first = +dayKeyOf(range.start).slice(0, 4);
  const last = +dayKeyOf(range.end).slice(0, 4);
  const [loaded, setLoaded] = React.useState<Record<number, string>>({});
  React.useEffect(() => {
    let active = true;
    for (let year = first; year <= last; year++) {
      void loadCalendar(year).then((days) => {
        if (active && days) {
          setLoaded((current) =>
            current[year] === days ? current : { ...current, [year]: days }
          );
        }
      });
    }
    return () => {
      active = false;
    };
  }, [first, last]);
  return loaded;
}

/** Bars of rows from a start to an end date on lanes, e.g. who is away. */
export function TimelineView({ rows }: { rows: ComputedRow[] }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = (useUserLocale() ?? "ru_RU").replace("_", "-");
  const { computed, view, openRow, userName } = useDatabase();
  const updateView = useUpdateView();
  const [cursor, setCursor] = React.useState(() => todayValue());
  const [scroll, setScroll] = React.useState<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState(0);
  const scale: TimelineScale = view.timelineScale ?? "month";
  const range = timelineRange(cursor, scale);
  const productionCalendars = useProductionCalendars(range);

  // The block can be as narrow as the document column: days get narrower
  // down to a minimum, then the timeline scrolls sideways.
  React.useEffect(() => {
    if (!scroll || typeof ResizeObserver === "undefined") {
      return;
    }
    setWidth(scroll.clientWidth);
    const observer = new ResizeObserver(() => setWidth(scroll.clientWidth));
    observer.observe(scroll);
    return () => observer.disconnect();
  }, [scroll]);

  const days = range.end - range.start + 1;
  const labelWidth = width && width < 520 ? 96 : 150;
  const minDay = scale === "year" ? 3 : scale === "quarter" ? 6 : 18;
  const dayWidth = Math.max(
    minDay,
    Math.min(48, Math.floor((width - labelWidth) / days) || 0)
  );
  const x = (day: number) => (day - range.start) * dayWidth;
  const today = dayNumber(todayValue());
  const todayShown = today >= range.start && today <= range.end;

  // Today is in sight when a period opens (not on every resize).
  const measured = width > 0;
  React.useEffect(() => {
    if (scroll) {
      scroll.scrollLeft = todayShown
        ? Math.max(0, x(today) - (scroll.clientWidth - labelWidth) / 2)
        : 0;
    }
    // Only for a new period or scale and once the width is known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scroll, range.start, scale, measured]);

  const column = (id: string | undefined, type?: ColumnType) =>
    computed.columns.find((c) => c.id === id && (!type || c.type === type));
  const startColumn = column(view.dateColumn, ColumnType.Date);
  const endColumn = column(view.endColumn, ColumnType.Date);
  const colorColumn = column(view.colorColumn, ColumnType.Select);
  const weekdayColumn = column(view.weekdayColumn, ColumnType.Select);
  const titleColumn = computed.columns[0];
  const laneColumn = column(view.laneColumn) ?? titleColumn;

  if (!startColumn || !titleColumn) {
    return <Notice>{t("Choose a start date column in “Fields”.")}</Notice>;
  }

  const layout = timelineLayout(computed.columns, rows, view, range, userName);

  const format = (day: number, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(
      new Date(day * 86400000)
    );
  // Russian "ноябрь 2026 г.": capitalize the month only.
  const title =
    scale === "year"
      ? dayKeyOf(range.start).slice(0, 4)
      : scale === "quarter"
        ? `${format(range.start, { month: "long" })} — ${format(range.end, {
            month: "long",
            year: "numeric",
          })}`
        : format(range.start, { month: "long", year: "numeric" });
  const scaleLabels: Record<TimelineScale, string> = {
    month: t("Month"),
    quarter: t("Quarter"),
    year: t("Year"),
  };

  const allDays = Array.from({ length: days }, (_, i) => range.start + i);
  const kinds = allDays.map((day) => dayKind(day, productionCalendars));
  const offRuns = dayRuns(allDays.filter((_, i) => kinds[i] === "off"));
  const overlapRuns = dayRuns([...layout.overlaps.keys()]);
  const months = monthSpans(range);
  const trackWidth = days * dayWidth;

  const text = (col: Column, row: ComputedRow) =>
    displayValue(col, row.cells[col.id], userName);
  const palette = (row: ComputedRow) => {
    const option = colorColumn?.options?.find(
      (o) => o.id === row.cells[colorColumn.id]
    );
    const color = option?.color ?? (colorColumn ? "gray" : "blue");
    return optionPalette[color][theme.isDark ? "dark" : "light"];
  };
  const barLabel = (row: ComputedRow) =>
    [
      laneColumn.id !== titleColumn.id ? text(titleColumn, row) : "",
      colorColumn ? text(colorColumn, row) : "",
    ]
      .filter(Boolean)
      .join(" · ");

  // Tooltip: who, dates, then the select columns (type, status).
  const describe = (item: TimelineItem<ComputedRow>) => {
    const row = item.row;
    const start = formatDate(row.cells[startColumn.id]);
    const end = endColumn ? formatDate(row.cells[endColumn.id]) : "";
    const lines = [text(titleColumn, row) || t("Untitled")];
    if (item.weekly && weekdayColumn) {
      lines.push(`${text(weekdayColumn, row)}, ${t("every week")}`);
      if (start || end) {
        lines.push(`${start || "…"} — ${end || t("no end date")}`);
      }
    } else {
      lines.push(end && end !== start ? `${start} — ${end}` : start);
    }
    for (const col of computed.columns) {
      if (
        col.type === ColumnType.Select &&
        col.id !== weekdayColumn?.id &&
        col.id !== titleColumn.id &&
        !view.hidden.includes(col.id)
      ) {
        const value = text(col, row);
        if (value) {
          lines.push(`${col.name}: ${value}`);
        }
      }
    }
    return lines.join("\n");
  };

  const overlapTitle = ([first, last]: [number, number]) => {
    const names = new Set<string>();
    for (let day = first; day <= last; day++) {
      layout.overlaps.get(day)?.forEach((name) => names.add(name));
    }
    const dates =
      first === last
        ? formatDate(dayKeyOf(first))
        : `${formatDate(dayKeyOf(first))} — ${formatDate(dayKeyOf(last))}`;
    return `${t("Overlap")} ${dates}: ${[...names]
      .map((name) => name || t("Untitled"))
      .join(", ")}`;
  };

  const dayTitle = (day: number, index: number) =>
    kinds[index] === "short"
      ? t("Shortened working day")
      : kinds[index] === "off" && weekdayOf(day) < 5
        ? t("Non-working day")
        : undefined;

  const renderItem = (item: TimelineItem<ComputedRow>) => {
    const [bg, fg] = palette(item.row);
    const top = item.level * LINE + 6;
    const tooltip = describe(item);
    if (item.weekly) {
      // Striped marks; days too narrow for stripes get a solid mark.
      const wide = dayWidth >= 9;
      const background = wide
        ? `repeating-linear-gradient(135deg, ${bg} 0 3px, ${transparentize(0.55, bg)} 3px 6px)`
        : transparentize(0.5, fg);
      return item.weekly.map((day) => (
        <Mark
          key={`${item.row.id}-${day}`}
          type="button"
          title={tooltip}
          aria-label={tooltip}
          onClick={() => openRow(item.row.id)}
          style={{
            left: x(day) + 1,
            top,
            width: Math.max(2, dayWidth - 2),
            background,
            borderColor: wide ? fg : "transparent",
          }}
        />
      ));
    }
    const label = barLabel(item.row);
    const barWidth = (item.end - item.start + 1) * dayWidth - 2;
    return (
      <Bar
        key={item.row.id}
        type="button"
        title={tooltip}
        aria-label={tooltip}
        onClick={() => openRow(item.row.id)}
        style={{
          left: x(item.start) + 1,
          top,
          width: Math.max(2, barWidth),
          background: bg,
          color: fg,
          // The edge stays visible on shaded and highlighted days.
          boxShadow: `inset 0 0 0 1px ${transparentize(0.75, fg)}`,
          borderTopLeftRadius: item.before ? 0 : 4,
          borderBottomLeftRadius: item.before ? 0 : 4,
          borderTopRightRadius: item.after ? 0 : 4,
          borderBottomRightRadius: item.after ? 0 : 4,
        }}
      >
        {barWidth >= 48 ? label : null}
      </Bar>
    );
  };

  return (
    <Wrapper>
      <Nav>
        <PeriodTitle>{capitalize(title)}</PeriodTitle>
        <Modes>
          {timelineScales.map((item) => (
            <SmallButton
              key={item}
              type="button"
              $highlight={item === scale}
              onClick={() => updateView({ timelineScale: item })}
            >
              {scaleLabels[item]}
            </SmallButton>
          ))}
        </Modes>
        <Arrows>
          <SmallButton
            type="button"
            aria-label={t("Previous")}
            onClick={() => setCursor((c) => shiftPeriod(c, scale, -1))}
          >
            <BackIcon size={18} />
          </SmallButton>
          <SmallButton type="button" onClick={() => setCursor(todayValue())}>
            {t("Today")}
          </SmallButton>
          <SmallButton
            type="button"
            aria-label={t("Next")}
            onClick={() => setCursor((c) => shiftPeriod(c, scale, 1))}
          >
            <NextIcon size={18} />
          </SmallButton>
        </Arrows>
      </Nav>
      <Scroll ref={setScroll}>
        <Canvas style={{ width: labelWidth + trackWidth }}>
          <Layer style={{ left: labelWidth, width: trackWidth }}>
            {offRuns.map(([first, last]) => (
              <Shade
                key={first}
                style={{ left: x(first), width: (last - first + 1) * dayWidth }}
              />
            ))}
            {overlapRuns.map(([first, last]) => (
              <Shade
                key={`o${first}`}
                style={{
                  left: x(first),
                  width: (last - first + 1) * dayWidth,
                  background: transparentize(0.86, theme.warning),
                }}
              />
            ))}
            {months.slice(1).map((month) => (
              <Divider key={month.start} style={{ left: x(month.start) }} />
            ))}
          </Layer>

          {scale !== "month" && (
            <HeaderRow>
              <Label style={{ width: labelWidth }} />
              <Track style={{ width: trackWidth, height: 22 }}>
                {months.map((month) => {
                  const monthWidth = (month.end - month.start + 1) * dayWidth;
                  return (
                    <MonthName
                      key={month.start}
                      style={{ left: x(month.start), width: monthWidth }}
                    >
                      {capitalize(
                        format(month.start, {
                          month: monthWidth >= 64 ? "long" : "short",
                        })
                      )}
                    </MonthName>
                  );
                })}
              </Track>
            </HeaderRow>
          )}
          {scale !== "year" && (
            <HeaderRow>
              <Label style={{ width: labelWidth }} />
              <Track
                style={{
                  width: trackWidth,
                  height: scale === "month" ? 36 : 20,
                }}
              >
                {allDays.map((day, index) =>
                  scale === "month" ? (
                    <DayHead
                      key={day}
                      title={dayTitle(day, index)}
                      style={{ left: x(day), width: dayWidth }}
                      $off={kinds[index] === "off"}
                    >
                      <DayNumber $today={day === today}>
                        {+dayKeyOf(day).slice(8, 10)}
                      </DayNumber>
                      <Weekday>{format(day, { weekday: "short" })}</Weekday>
                    </DayHead>
                  ) : weekdayOf(day) === 0 ? (
                    // Quarters: the dates of Mondays.
                    <WeekStart key={day} style={{ left: x(day) }}>
                      {+dayKeyOf(day).slice(8, 10)}
                    </WeekStart>
                  ) : null
                )}
              </Track>
            </HeaderRow>
          )}
          <LaneRow style={{ height: 14 }}>
            <Label style={{ width: labelWidth, lineHeight: "14px" }}>
              <Small>{t("Overlaps")}</Small>
            </Label>
            <Track style={{ width: trackWidth }}>
              {overlapRuns.map((run) => (
                <OverlapMark
                  key={run[0]}
                  title={overlapTitle(run)}
                  style={{
                    left: x(run[0]),
                    width: (run[1] - run[0] + 1) * dayWidth,
                  }}
                />
              ))}
            </Track>
          </LaneRow>
          {layout.lanes.map((lane) => {
            const label = lane.label || t("Untitled");
            return (
              <LaneRow
                key={lane.key}
                style={{ height: lane.levels * LINE + 8 }}
              >
                <Label style={{ width: labelWidth }} title={label}>
                  {label}
                </Label>
                <Track style={{ width: trackWidth }}>
                  {lane.items.map(renderItem)}
                </Track>
              </LaneRow>
            );
          })}
          {todayShown && (
            <TodayLine
              style={{ left: labelWidth + x(today) + dayWidth / 2 - 1 }}
            />
          )}
        </Canvas>
      </Scroll>
    </Wrapper>
  );
}

const Wrapper = styled.div`
  padding: 8px 0 12px;
`;

const Nav = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
`;

const PeriodTitle = styled.div`
  font-size: 16px;
  font-weight: 600;
  margin-right: auto;
`;

const Modes = styled.div`
  display: flex;
  gap: 2px;
  margin-right: 8px;
`;

const Arrows = styled.div`
  display: flex;
  gap: 2px;
`;

const Scroll = styled.div`
  overflow-x: auto;
  border-top: 1px solid ${s("divider")};
`;

const Canvas = styled.div`
  position: relative;
  min-width: 100%;
`;

const Layer = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  pointer-events: none;
`;

const Shade = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  background: ${s("backgroundSecondary")};
`;

const Divider = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: ${s("divider")};
`;

const TodayLine = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  z-index: 1;
  background: ${s("accent")};
  opacity: 0.6;
  pointer-events: none;
`;

const LaneRow = styled.div`
  position: relative;
  display: flex;
  border-bottom: 1px solid ${s("divider")};
`;

const HeaderRow = styled(LaneRow)`
  color: ${s("textTertiary")};
  font-size: 12px;
`;

const Label = styled.div`
  position: sticky;
  left: 0;
  z-index: 2;
  flex-shrink: 0;
  padding: 0 8px;
  border-right: 1px solid ${s("divider")};
  background: ${s("background")};
  font-size: 13px;
  line-height: ${LINE + 8}px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Small = styled.span`
  color: ${s("textTertiary")};
  font-size: 11px;
`;

const Track = styled.div`
  position: relative;
  flex-shrink: 0;
`;

const MonthName = styled.div`
  position: absolute;
  top: 0;
  padding: 3px 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const DayHead = styled.div<{ $off: boolean }>`
  position: absolute;
  top: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 14px;
  color: ${(props) =>
    props.$off ? props.theme.textTertiary : props.theme.textSecondary};
`;

const DayNumber = styled.span<{ $today: boolean }>`
  min-width: 18px;
  border-radius: 9px;
  text-align: center;
  ${(props) =>
    props.$today &&
    css`
      background: ${props.theme.accent};
      color: white;
    `}
`;

const Weekday = styled.span`
  font-size: 10px;
`;

const WeekStart = styled.div`
  position: absolute;
  top: 0;
  padding: 2px 3px;
  border-left: 1px solid ${s("divider")};
  line-height: 14px;
`;

const OverlapMark = styled.div`
  position: absolute;
  top: 4px;
  height: 6px;
  border-radius: 3px;
  background: ${s("warning")};
`;

const Bar = styled.button`
  position: absolute;
  height: ${LINE - 4}px;
  padding: 0 6px;
  border: 0;
  font-size: 12px;
  line-height: ${LINE - 4}px;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;

  &:hover {
    filter: brightness(0.95);
  }
`;

const Mark = styled.button`
  position: absolute;
  height: ${LINE - 4}px;
  padding: 0;
  border: 1px solid;
  border-radius: 3px;
  cursor: pointer;
`;

const Notice = styled.div`
  padding: 16px 8px;
  color: ${s("textTertiary")};
  font-size: 14px;
`;
