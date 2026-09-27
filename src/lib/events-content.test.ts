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
// L'agenda est lu à une date FIXE (1er sept. 2026) : les assertions ne
// dépendent pas du jour où la suite tourne.
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
    // Toute option proposée dans les autres facettes correspond à >=1 événement
    // réel -> en cochant, on ne tombe jamais sur « aucun résultat ».
    for (const opt of [...f.types, ...f.formats, ...f.langs]) {
      expect(opt.count).toBeGreaterThan(0);
    }
    // La facette REGION ignore sa propre sélection : afrique reste cochable/
    // décochable, et on voit toujours les autres régions (compteurs « OU »).
    expect(f.regions.some((x) => x.value === 'afrique')).toBe(true);
    // Le contexte ne peut que réduire (ou laisser égal) le nombre d'options.
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
    // Ordre du calendrier, pas de fréquence.
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
