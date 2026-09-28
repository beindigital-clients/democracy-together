// EVENT DATES WITH TIME ZONE — pure logic, shared by Convex and the site.
//
// An event is entered the way it is announced: a DAY (`2026-11-14`), an optional
// time (`09:30`) and the venue's time zone (`Europe/Paris`). The database keeps
// this input as is — it is what gets redisplayed and re-edited — and
// DERIVES two UTC instants from it, `startsAt` and `endsAt`, used for sorting,
// indexing and deciding (an event whose `endsAt` has passed is closed).
//
// Why not a plain entered timestamp: "14 November at 9:30 in Dakar"
// is not the same instant as "in Paris", and daylight saving time shifts the
// offset depending on the date. `Intl.DateTimeFormat` carries the time zone
// database (IANA) in the Convex runtime as in the browser: we query it rather
// than copying offsets that change.

export const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return false;
  // "Day 0" of the following month is the last day of the month.
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

export function isValidTime(value: string): boolean {
  return TIME_RE.test(value);
}

export function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Offset (ms) of time zone `tz` at instant `utcMs`: wall-clock time read as if
// it were UTC, minus the real instant.
function offsetAt(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wall = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
  return wall - Math.floor(utcMs / 1000) * 1000;
}

/**
 * UTC instant of a wall-clock time (`date` + `time`) in time zone `tz`.
 *
 * Two passes: the offset depends on the instant sought (daylight saving), so we
 * estimate it on a first approximation then recompute it on the
 * result. A time that does not exist (spring-forward gap) lands on the instant
 * just after the gap — the calendar convention.
 */
export function zonedTimeToUtc(date: string, time: string, tz: string): number {
  const dm = DATE_RE.exec(date);
  const tm = TIME_RE.exec(time);
  if (!dm || !tm) throw new Error('INVALID_DATE');
  const guess = Date.UTC(
    Number(dm[1]),
    Number(dm[2]) - 1,
    Number(dm[3]),
    Number(tm[1]),
    Number(tm[2]),
  );
  const first = offsetAt(guess, tz);
  const candidate = guess - first;
  const second = offsetAt(candidate, tz);
  return second === first ? candidate : guess - second;
}

export type EventSchedule = {
  startDate: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  timezone: string;
};

/**
 * The two instants derived from an input. Without a time, the event covers the
 * whole day in its time zone: it starts at 00:00 and ends at the
 * last millisecond of its last day.
 */
export function scheduleInstants(s: EventSchedule): {
  startsAt: number;
  endsAt: number;
} {
  const startsAt = zonedTimeToUtc(
    s.startDate,
    s.startTime ?? '00:00',
    s.timezone,
  );
  const endDay = s.endDate ?? s.startDate;
  const endsAt = s.endTime
    ? zonedTimeToUtc(endDay, s.endTime, s.timezone)
    : zonedTimeToUtc(nextDay(endDay), '00:00', s.timezone) - 1;
  return { startsAt, endsAt };
}

/** The day after a `YYYY-MM-DD` date. */
export function nextDay(date: string): string {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error('INVALID_DATE');
  const d = new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1),
  );
  return d.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` from a coded catalog date (y, mo 1-12, d). */
export function isoDate(y: number, mo: number, d: number): string {
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** The components (y, mo, d) of a `YYYY-MM-DD` date. */
export function dateParts(date: string): { y: number; mo: number; d: number } {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error('INVALID_DATE');
  return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
}
