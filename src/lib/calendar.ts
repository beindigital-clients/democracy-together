// Calendar view of events (Wave 4, complement to /evenements).
// PURE, testable functions: they receive year/month as parameters and
// do NOT read the system clock. The server page reads today's date.
//
// `month` is always 1-based (1 = January … 12 = December) in the
// public API, to stay consistent with EventData.mo. Internally we convert
// to the 0-based month expected by JS's Date object.

import type { EventData } from './events-content';
import { EVENTS } from './events-content';

export type CalendarCell<E extends EventData = EventData> = {
  day: number | null; // day number, or null for filler cells
  events: E[]; // events falling on that day (empty for null cells)
};

export type MonthGrid<E extends EventData = EventData> = {
  year: number;
  month: number; // 1-12
  weeks: CalendarCell<E>[][]; // 6 rows × 7 columns (Monday → Sunday)
};

const WEEKS = 6;
const DAYS_PER_WEEK = 7;

// Weekday of the 1st of the month, mapped to an index Monday=0 … Sunday=6
// (the grid starts on Monday, the mock-ups' European convention).
function mondayFirstWeekday(year: number, month: number): number {
  const jsDay = new Date(year, month - 1, 1).getDay(); // 0 = dimanche … 6 = samedi
  return (jsDay + 6) % 7; // 0 = lundi … 6 = dimanche
}

// Number of days in the month ("day 0" of the next month = last day).
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// Builds a monthly grid of 6 weeks × 7 cells.
// - `null` cells before the 1st (weekday offset) and after the last
//   day (until the 42 cells are filled).
// - Each cell holds the events whose (y, mo, d) match exactly.
// Generic over the event shape: the page passes the loaded agenda (table
// or hard-coded fallback, `src/lib/contenus/`), each event of which already carries its
// translated title; the tests pass the default hard-coded catalogue.
export function buildMonthGrid<E extends EventData = EventData>(
  year: number,
  month: number /* 1-12 */,
  events: E[] = EVENTS as E[],
): MonthGrid<E> {
  const offset = mondayFirstWeekday(year, month);
  const total = daysInMonth(year, month);

  // Index of events by day of month for this (year, month).
  const byDay = new Map<number, E[]>();
  for (const e of events) {
    if (e.y === year && e.mo === month) {
      const bucket = byDay.get(e.d);
      if (bucket) bucket.push(e);
      else byDay.set(e.d, [e]);
    }
  }

  const cells: CalendarCell<E>[] = [];
  for (let i = 0; i < WEEKS * DAYS_PER_WEEK; i++) {
    const dayNumber = i - offset + 1;
    if (dayNumber < 1 || dayNumber > total) {
      cells.push({ day: null, events: [] });
    } else {
      cells.push({ day: dayNumber, events: byDay.get(dayNumber) ?? [] });
    }
  }

  const weeks: CalendarCell<E>[][] = [];
  for (let w = 0; w < WEEKS; w++) {
    weeks.push(cells.slice(w * DAYS_PER_WEEK, (w + 1) * DAYS_PER_WEEK));
  }

  return { year, month, weeks };
}

// Shifts (year, month) by `delta` months, handling year rollover.
// month is 1-based on input and output.
export function monthShift(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  // Global 0-based month index (Jan of year 0 = 0), then re-projection.
  const total = year * 12 + (month - 1) + delta;
  return {
    year: Math.floor(total / 12),
    month: (((total % 12) + 12) % 12) + 1,
  };
}

// Serializes (year, month) to the URL parameter `ym=YYYY-MM`.
export function formatYm(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

// Parses `ym=YYYY-MM`; returns null if missing or malformed (month outside 1-12).
export function parseYm(
  value: string | string[] | undefined,
): { year: number; month: number } | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const m = /^(\d{4})-(\d{1,2})$/.exec(raw.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}
