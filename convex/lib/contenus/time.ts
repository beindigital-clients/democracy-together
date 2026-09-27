// DATES D'ÉVÉNEMENT AVEC FUSEAU — logique pure, partagée par Convex et le site.
//
// Un événement se saisit comme on l'annonce : un JOUR (`2026-11-14`), une heure
// facultative (`09:30`) et le fuseau du lieu (`Europe/Paris`). La base garde
// cette saisie telle quelle — c'est elle qu'on réaffiche et qu'on réédite — et
// en DÉRIVE deux instants UTC, `startsAt` et `endsAt`, qui servent à trier, à
// indexer et à décider (un événement dont `endsAt` est passé est clos).
//
// Pourquoi pas un simple horodatage saisi : « 14 novembre à 9 h 30 à Dakar »
// n'est pas le même instant que « à Paris », et l'heure d'été déplace l'écart
// selon la date. `Intl.DateTimeFormat` porte la base des fuseaux (IANA) dans
// le runtime Convex comme dans le navigateur : on l'interroge plutôt que de
// recopier des décalages qui changent.

export const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return false;
  // Le « jour 0 » du mois suivant est le dernier jour du mois.
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

// Décalage (ms) du fuseau `tz` à l'instant `utcMs` : heure murale lue comme si
// elle était UTC, moins l'instant réel.
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
 * Instant UTC d'une heure murale (`date` + `time`) dans le fuseau `tz`.
 *
 * Deux passes : le décalage dépend de l'instant cherché (heure d'été), donc on
 * l'estime sur une première approximation puis on le recalcule sur le
 * résultat. Une heure qui n'existe pas (saut de printemps) tombe sur l'instant
 * juste après le saut — la convention des agendas.
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
 * Les deux instants dérivés d'une saisie. Sans heure, l'événement couvre la
 * journée entière dans son fuseau : il commence à 00:00 et se termine à la
 * dernière milliseconde de son dernier jour.
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

/** Le lendemain d'une date `YYYY-MM-DD`. */
export function nextDay(date: string): string {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error('INVALID_DATE');
  const d = new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1),
  );
  return d.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` à partir d'une date du catalogue codé (y, mo 1-12, d). */
export function isoDate(y: number, mo: number, d: number): string {
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Les composantes (y, mo, d) d'une date `YYYY-MM-DD`. */
export function dateParts(date: string): { y: number; mo: number; d: number } {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error('INVALID_DATE');
  return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
}
