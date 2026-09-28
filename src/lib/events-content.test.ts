import { describe, it, expect } from 'vitest';
import {
  computeEventFacets,
  filterAndSortEvents,
  getEventsLabels,
  parseEventFilters,
  type EventFilters,
} from './events-content';
import { codedAgenda } from './contenus/agenda';

const L = getEventsLabels('fr');
// The agenda is read at a FIXED date (1 Sept 2026): the assertions don't
// depend on the day the suite runs.
const NOW = Date.UTC(2026, 8, 1);
const events = codedAgenda('fr', NOW);
const base: EventFilters = {
  period: 'venir',
  types: [],
  regions: [],
  formats: [],
  langs: [],
  months: [],
  q: undefined,
  sort: 'date-asc',
};

describe('Événements — facettes contextuelles', () => {
  it('sans filtre : les facettes de la période ne sont pas vides', () => {
    const f = computeEventFacets(base, L, events);
    expect(f.types.length).toBeGreaterThan(0);
    expect(f.regions.length).toBeGreaterThan(0);
  });

  it('un filtre actif restreint les AUTRES facettes (pas de cul-de-sac)', () => {
    const f = computeEventFacets({ ...base, regions: ['afrique'] }, L, events);
    // Every option offered in the other facets matches >=1 real
    // event -> ticking one never lands on "aucun résultat".
    for (const opt of [...f.types, ...f.formats, ...f.langs]) {
      expect(opt.count).toBeGreaterThan(0);
    }
    // The REGION facet ignores its own selection: afrique stays checkable/
    // uncheckable, and the other regions are always visible ("OR" counts).
    expect(f.regions.some((x) => x.value === 'afrique')).toBe(true);
    // The context can only reduce (or leave equal) the number of options.
    const all = computeEventFacets(base, L, events);
    expect(f.types.length).toBeLessThanOrEqual(all.types.length);
  });
});

describe('Événements — filtre par mois (F-52)', () => {
  it('lit `?mois=`, ignore une valeur mal formée', () => {
    expect(parseEventFilters({ mois: '2026-11,2026-13,zz' }).months).toEqual([
      '2026-11',
    ]);
  });

  it('restreint la liste au mois choisi ; la facette propose les mois peuplés', () => {
    const nov = filterAndSortEvents(
      { ...base, months: ['2026-11'] },
      L,
      events,
    );
    expect(nov.length).toBeGreaterThan(0);
    expect(nov.every((e) => e.y === 2026 && e.mo === 11)).toBe(true);
    const f = computeEventFacets(base, L, events);
    expect(f.months.map((m) => m.value)).toContain('2026-11');
    // Calendar order, not frequency.
    const values = f.months.map((m) => m.value);
    expect(values).toEqual([...values].sort());
  });

  it('la recherche porte sur le titre et le lieu traduits', () => {
    const r = filterAndSortEvents({ ...base, q: 'bruxelles' }, L, events);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((e) => /bruxelles/i.test(`${e.title} ${e.place}`))).toBe(
      true,
    );
  });
});
