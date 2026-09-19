// F-52 Agenda — générateur iCalendar (RFC 5545) PUR et testable.
// Produit un VCALENDAR à un seul VEVENT pour un événement « journée entière »
// (DTSTART/DTEND en VALUE=DATE). Aucune dépendance Next/Convex : la logique
// d'échappement et de formatage est isolée ici pour pouvoir être testée
// unitairement. Le route handler `evenements/[slug]/agenda.ics` consomme cette
// fonction avec les libellés localisés selon le segment de locale.

export type IcsDate = { y: number; mo: number; d: number }; // mo: 1-12

export type IcsEvent = {
  uid: string;
  start: IcsDate;
  title: string;
  location?: string;
  description?: string;
  url?: string;
};

// Échappement des valeurs texte iCalendar (RFC 5545 §3.3.11) :
// backslash, virgule et point-virgule sont préfixés ; les sauts de ligne
// deviennent la séquence littérale « \n ». On traite \r\n et \r comme \n.
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

// Formate une date « jour entier » en YYYYMMDD (zéro-paddé).
function formatDate({ y, mo, d }: IcsDate): string {
  const yyyy = String(y).padStart(4, '0');
  const mm = String(mo).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

// DTEND d'un événement journée entière est exclusif : le lendemain de DTSTART.
// On passe par un Date UTC pour gérer proprement les fins de mois / années
// bissextiles, sans décalage de fuseau.
function nextDay({ y, mo, d }: IcsDate): IcsDate {
  const t = new Date(Date.UTC(y, mo - 1, d + 1));
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

// Horodatage DTSTAMP au format UTC compact YYYYMMDDTHHMMSSZ.
function formatStamp(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  );
}

/**
 * Construit une chaîne VCALENDAR valide (un seul VEVENT) pour un événement
 * « journée entière ». Les lignes sont jointes par CRLF, comme l'exige la
 * spécification. `now` est injectable pour des tests déterministes.
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
