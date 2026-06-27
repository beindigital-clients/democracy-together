// Vue calendrier des événements (Vague 4, complément de /evenements).
// Fonctions PURES et testables : elles reçoivent year/month en paramètres et
// NE lisent PAS l'horloge système. La page serveur lit la date du jour.
//
// `month` est toujours exprimé en base 1 (1 = janvier … 12 = décembre) côté
// API publique, pour rester cohérent avec EventData.mo. En interne on convertit
// vers la base 0 attendue par l'objet Date de JS.

import type { EventData } from './events-content';
import { EVENTS } from './events-content';

export type CalendarCell = {
  day: number | null; // numéro du jour, ou null pour les cases de remplissage
  events: EventData[]; // événements tombant ce jour-là (vide pour les cases null)
};

export type MonthGrid = {
  year: number;
  month: number; // 1-12
  weeks: CalendarCell[][]; // 6 lignes × 7 colonnes (lundi → dimanche)
};

const WEEKS = 6;
const DAYS_PER_WEEK = 7;

// Jour de la semaine du 1er du mois, ramené à un index lundi=0 … dimanche=6
// (la grille démarre le lundi, convention européenne des maquettes).
function mondayFirstWeekday(year: number, month: number): number {
  const jsDay = new Date(year, month - 1, 1).getDay(); // 0 = dimanche … 6 = samedi
  return (jsDay + 6) % 7; // 0 = lundi … 6 = dimanche
}

// Nombre de jours dans le mois (le « jour 0 » du mois suivant = dernier jour).
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// Construit une grille mensuelle de 6 semaines × 7 cases.
// - Cases `null` avant le 1er (offset du jour de semaine) et après le dernier
//   jour (jusqu'à compléter les 42 cases).
// - Chaque case porte les événements dont (y, mo, d) correspondent exactement.
export function buildMonthGrid(
  year: number,
  month: number /* 1-12 */,
  events: EventData[] = EVENTS,
): MonthGrid {
  const offset = mondayFirstWeekday(year, month);
  const total = daysInMonth(year, month);

  // Index des événements par jour du mois pour ce (year, month).
  const byDay = new Map<number, EventData[]>();
  for (const e of events) {
    if (e.y === year && e.mo === month) {
      const bucket = byDay.get(e.d);
      if (bucket) bucket.push(e);
      else byDay.set(e.d, [e]);
    }
  }

  const cells: CalendarCell[] = [];
  for (let i = 0; i < WEEKS * DAYS_PER_WEEK; i++) {
    const dayNumber = i - offset + 1;
    if (dayNumber < 1 || dayNumber > total) {
      cells.push({ day: null, events: [] });
    } else {
      cells.push({ day: dayNumber, events: byDay.get(dayNumber) ?? [] });
    }
  }

  const weeks: CalendarCell[][] = [];
  for (let w = 0; w < WEEKS; w++) {
    weeks.push(cells.slice(w * DAYS_PER_WEEK, (w + 1) * DAYS_PER_WEEK));
  }

  return { year, month, weeks };
}

// Décale (year, month) de `delta` mois en gérant le passage d'année.
// month en base 1 en entrée comme en sortie.
export function monthShift(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  // Index global de mois en base 0 (janv. an 0 = 0), puis re-projection.
  const total = year * 12 + (month - 1) + delta;
  return {
    year: Math.floor(total / 12),
    month: (((total % 12) + 12) % 12) + 1,
  };
}

// Sérialise (year, month) en paramètre d'URL `ym=YYYY-MM`.
export function formatYm(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

// Parse `ym=YYYY-MM` ; renvoie null si absent ou mal formé (mois hors 1-12).
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
