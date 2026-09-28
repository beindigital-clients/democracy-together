// F-52 Agenda — PURE, testable iCalendar (RFC 5545) generator.
// Produces a VCALENDAR with a single VEVENT for an "all-day" event
// (DTSTART/DTEND as VALUE=DATE). No Next/Convex dependency: the escaping and
// formatting logic is isolated here so it can be unit
// tested. The `evenements/[slug]/agenda.ics` route handler consumes this
// function with labels localized according to the locale segment.

export type IcsDate = { y: number; mo: number; d: number }; // mo: 1-12

export type IcsEvent = {
  uid: string;
  start: IcsDate;
  title: string;
  location?: string;
  description?: string;
  url?: string;
};

// Escaping of iCalendar text values (RFC 5545 §3.3.11):
// backslash, comma and semicolon are prefixed; line breaks
// become the literal sequence "\n". \r\n and \r are treated as \n.
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

// Formats an "all-day" date as YYYYMMDD (zero-padded).
function formatDate({ y, mo, d }: IcsDate): string {
  const yyyy = String(y).padStart(4, '0');
  const mm = String(mo).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

// DTEND of an all-day event is exclusive: the day after DTSTART.
// We go through a UTC Date to cleanly handle month ends / leap
// years, without a time-zone shift.
function nextDay({ y, mo, d }: IcsDate): IcsDate {
  const t = new Date(Date.UTC(y, mo - 1, d + 1));
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

// DTSTAMP timestamp in compact UTC format YYYYMMDDTHHMMSSZ.
function formatStamp(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  );
}

/**
 * Builds a valid VCALENDAR string (a single VEVENT) for an "all-day"
 * event. Lines are joined with CRLF, as the
 * specification requires. `now` is injectable for deterministic tests.
 */
export function eventToIcs(event: IcsEvent, now: Date = new Date()): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Democracy Together//Agenda//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeText(event.uid)}`,
    `DTSTAMP:${formatStamp(now)}`,
    `DTSTART;VALUE=DATE:${formatDate(event.start)}`,
    `DTEND;VALUE=DATE:${formatDate(nextDay(event.start))}`,
    `SUMMARY:${escapeText(event.title)}`,
  ];

  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.description)
    lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.url) lines.push(`URL:${escapeText(event.url)}`);

  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.join('\r\n');
}
