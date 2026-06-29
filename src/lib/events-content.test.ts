import { describe, it, expect } from 'vitest';
import {
  computeEventFacets,
  getEventsLabels,
  type EventFilters,
} from './events-content';

const L = getEventsLabels('fr');
const base: EventFilters = {
  period: 'venir',
  types: [],
  regions: [],
  formats: [],
  langs: [],
  q: undefined,
  sort: 'date-asc',
};

describe('Événements — facettes contextuelles', () => {
  it('sans filtre : les facettes de la période ne sont pas vides', () => {
    const f = computeEventFacets(base, L);
    expect(f.types.length).toBeGreaterThan(0);
    expect(f.regions.length).toBeGreaterThan(0);
  });

  it('un filtre actif restreint les AUTRES facettes (pas de cul-de-sac)', () => {
    const f = computeEventFacets({ ...base, regions: ['afrique'] }, L);
    // Toute option proposée dans les autres facettes correspond à >=1 événement
    // réel -> en cochant, on ne tombe jamais sur « aucun résultat ».
    for (const opt of [...f.types, ...f.formats, ...f.langs]) {
      expect(opt.count).toBeGreaterThan(0);
    }
    // La facette REGION ignore sa propre sélection : afrique reste cochable/
    // décochable, et on voit toujours les autres régions (compteurs « OU »).
    expect(f.regions.some((x) => x.value === 'afrique')).toBe(true);
    // Le contexte ne peut que réduire (ou laisser égal) le nombre d'options.
    const all = computeEventFacets(base, L);
    expect(f.types.length).toBeLessThanOrEqual(all.types.length);
  });
});
