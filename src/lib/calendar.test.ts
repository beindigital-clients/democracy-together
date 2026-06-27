import { describe, it, expect } from 'vitest';
import {
  buildMonthGrid,
  monthShift,
  daysInMonth,
  formatYm,
  parseYm,
} from './calendar';
import {
  EVENTS,
  getEventsLabels,
  type EventData,
} from './events-content';

// Helpers de test
function allCells(grid: ReturnType<typeof buildMonthGrid>) {
  return grid.weeks.flat();
}
function dayCells(grid: ReturnType<typeof buildMonthGrid>) {
  return allCells(grid).filter((c) => c.day !== null);
}

describe('buildMonthGrid — forme de la grille', () => {
  it('produit toujours 6 semaines de 7 cases (42 au total)', () => {
    const grid = buildMonthGrid(2026, 2);
    expect(grid.weeks).toHaveLength(6);
    for (const week of grid.weeks) expect(week).toHaveLength(7);
    expect(allCells(grid)).toHaveLength(42);
  });

  it('renvoie year/month tels que fournis (base 1)', () => {
    const grid = buildMonthGrid(2026, 11);
    expect(grid.year).toBe(2026);
    expect(grid.month).toBe(11);
  });
});

describe('buildMonthGrid — comptage des jours', () => {
  it('février 2026 (non bissextile) compte 28 jours', () => {
    const grid = buildMonthGrid(2026, 2);
    expect(dayCells(grid)).toHaveLength(28);
    // Les numéros vont de 1 à 28, sans trou.
    expect(dayCells(grid).map((c) => c.day)).toEqual(
      Array.from({ length: 28 }, (_, i) => i + 1),
    );
  });

  it('février 2024 (bissextile) compte 29 jours', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(dayCells(buildMonthGrid(2024, 2))).toHaveLength(29);
  });

  it('compte correctement les mois de 30 et 31 jours', () => {
    expect(dayCells(buildMonthGrid(2026, 4))).toHaveLength(30); // avril
    expect(dayCells(buildMonthGrid(2026, 12))).toHaveLength(31); // décembre
  });
});

describe('buildMonthGrid — offset du 1er jour (lundi=0)', () => {
  it('positionne le 1er février 2026 (un dimanche) en dernière colonne de la 1re semaine', () => {
    // 1 févr. 2026 = dimanche -> index lundi-first = 6
    const grid = buildMonthGrid(2026, 2);
    const firstWeek = grid.weeks[0];
    // Les 6 premières cases sont vides (null), la 7e porte le jour 1.
    for (let i = 0; i < 6; i++) expect(firstWeek[i].day).toBeNull();
    expect(firstWeek[6].day).toBe(1);
  });

  it('positionne le 1er juin 2026 (un lundi) en première colonne, sans case vide', () => {
    // 1 juin 2026 = lundi -> offset 0
    const grid = buildMonthGrid(2026, 6);
    expect(grid.weeks[0][0].day).toBe(1);
  });

  it("place les cases vides AVANT le 1er et APRÈS le dernier jour", () => {
    const grid = buildMonthGrid(2026, 2); // 28 jours, offset 6
    const cells = allCells(grid);
    // 6 cases vides en tête + 28 jours + reste vide = 42
    const nullCount = cells.filter((c) => c.day === null).length;
    expect(nullCount).toBe(42 - 28);
    // La toute dernière case du mois (28) suivie de cases nulles.
    const idx28 = cells.findIndex((c) => c.day === 28);
    expect(cells.slice(idx28 + 1).every((c) => c.day === null)).toBe(true);
  });
});

describe('buildMonthGrid — placement des événements', () => {
  it('place un événement connu à sa date exacte', () => {
    // conference-inaugurale : y 2026, mo 11, d 14
    const target = EVENTS.find((e) => e.slug === 'conference-inaugurale')!;
    const grid = buildMonthGrid(target.y, target.mo);
    const cell = dayCells(grid).find((c) => c.day === target.d);
    expect(cell).toBeTruthy();
    expect(cell!.events.map((e) => e.slug)).toContain('conference-inaugurale');
  });

  it("n'attache aucun événement aux cases vides (null)", () => {
    const grid = buildMonthGrid(2026, 11);
    for (const cell of allCells(grid)) {
      if (cell.day === null) expect(cell.events).toHaveLength(0);
    }
  });

  it('ignore les événements des autres mois/années', () => {
    const grid = buildMonthGrid(2026, 11);
    const placed = dayCells(grid).flatMap((c) => c.events);
    expect(placed.every((e) => e.y === 2026 && e.mo === 11)).toBe(true);
    // Au moins l'événement de novembre 2026 doit être présent.
    expect(placed.some((e) => e.slug === 'conference-inaugurale')).toBe(true);
  });

  it('regroupe plusieurs événements le même jour', () => {
    const custom: EventData[] = [
      { ...EVENTS[0], slug: 'a', y: 2026, mo: 3, d: 10 },
      { ...EVENTS[0], slug: 'b', y: 2026, mo: 3, d: 10 },
      { ...EVENTS[0], slug: 'c', y: 2026, mo: 3, d: 11 },
    ];
    const grid = buildMonthGrid(2026, 3, custom);
    const d10 = dayCells(grid).find((c) => c.day === 10)!;
    const d11 = dayCells(grid).find((c) => c.day === 11)!;
    expect(d10.events.map((e) => e.slug).sort()).toEqual(['a', 'b']);
    expect(d11.events.map((e) => e.slug)).toEqual(['c']);
  });

  it('utilise EVENTS par défaut quand aucun tableau n\'est fourni', () => {
    const sep = buildMonthGrid(2026, 9); // septembre a des événements seedés
    const placed = dayCells(sep).flatMap((c) => c.events);
    expect(placed.length).toBeGreaterThan(0);
  });
});

describe('monthShift — navigation mensuelle', () => {
  it('avance d\'un mois dans la même année', () => {
    expect(monthShift(2026, 6, 1)).toEqual({ year: 2026, month: 7 });
  });

  it('recule d\'un mois dans la même année', () => {
    expect(monthShift(2026, 6, -1)).toEqual({ year: 2026, month: 5 });
  });

  it('passe à l\'année suivante (décembre +1 = janvier)', () => {
    expect(monthShift(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });

  it('passe à l\'année précédente (janvier -1 = décembre)', () => {
    expect(monthShift(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });

  it('gère un saut de plusieurs mois traversant deux années', () => {
    expect(monthShift(2026, 11, 14)).toEqual({ year: 2028, month: 1 });
    expect(monthShift(2026, 2, -14)).toEqual({ year: 2024, month: 12 });
  });

  it('delta 0 est l\'identité', () => {
    expect(monthShift(2026, 7, 0)).toEqual({ year: 2026, month: 7 });
  });
});

describe('formatYm / parseYm — sérialisation URL', () => {
  it('formate avec mois sur deux chiffres', () => {
    expect(formatYm(2026, 2)).toBe('2026-02');
    expect(formatYm(2026, 11)).toBe('2026-11');
  });

  it('parse une valeur valide', () => {
    expect(parseYm('2026-02')).toEqual({ year: 2026, month: 2 });
    expect(parseYm('2026-2')).toEqual({ year: 2026, month: 2 });
  });

  it('renvoie null pour une entrée absente ou invalide', () => {
    expect(parseYm(undefined)).toBeNull();
    expect(parseYm('')).toBeNull();
    expect(parseYm('pas-une-date')).toBeNull();
    expect(parseYm('2026-13')).toBeNull(); // mois hors plage
    expect(parseYm('2026-00')).toBeNull();
  });

  it('prend la première valeur d\'un tableau de query', () => {
    expect(parseYm(['2026-05', '2026-06'])).toEqual({ year: 2026, month: 5 });
  });

  it('formatYm et parseYm sont réciproques', () => {
    const round = parseYm(formatYm(2026, 9));
    expect(round).toEqual({ year: 2026, month: 9 });
  });
});

describe('contenu — terme banni absent (FR + EN)', () => {
  it('aucun libellé getEventsLabels ne contient le terme banni', () => {
    for (const loc of ['fr', 'en'] as const) {
      const L = getEventsLabels(loc);
      const haystack = JSON.stringify({
        titles: L.titles,
        types: L.types,
      }).toLowerCase();
      expect(haystack).not.toContain('démocratie libérale');
      expect(haystack).not.toContain('liberal democracy');
    }
  });
});
