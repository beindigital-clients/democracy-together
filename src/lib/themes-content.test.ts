import { describe, it, expect } from 'vitest';
import {
  getThemeSyntheses,
  getThemeSynthesis,
  THEME_SLUGS,
} from './themes-content';
import { PUB_THEMES } from './publications';

describe('Synthèses thématiques (F-36)', () => {
  it('couvre exactement les 5 axes de PUB_THEMES, dans le même ordre', () => {
    expect([...THEME_SLUGS]).toEqual([...PUB_THEMES]);
    for (const loc of ['fr', 'en'] as const) {
      const all = getThemeSyntheses(loc);
      expect(all.map((s) => s.slug)).toEqual([...PUB_THEMES]);
      expect(all.map((s) => s.dimension)).toEqual([
        'D1',
        'D2',
        'D3',
        'D4',
        'D5',
      ]);
    }
  });

  it('chaque synthèse a un chapeau, au moins une position et des questions', () => {
    for (const loc of ['fr', 'en'] as const) {
      for (const s of getThemeSyntheses(loc)) {
        expect(s.lead.length).toBeGreaterThan(20);
        expect(s.stance.length).toBeGreaterThanOrEqual(1);
        expect(s.questions.length).toBeGreaterThanOrEqual(2);
        expect(s.stance.every((p) => p.length > 40)).toBe(true);
      }
    }
  });

  it('résout un slug valide, renvoie null sinon', () => {
    expect(getThemeSynthesis('fr', 'transitions')?.dimension).toBe('D4');
    expect(getThemeSynthesis('en', 'crises')?.slug).toBe('crises');
    expect(getThemeSynthesis('fr', 'inexistant')).toBeNull();
    expect(getThemeSynthesis('fr', '')).toBeNull();
  });

  it('aucun terme banni dans le contenu (FR + EN)', () => {
    const all = (['fr', 'en'] as const)
      .flatMap((loc) => getThemeSyntheses(loc))
      .flatMap((s) => [s.lead, ...s.stance, ...s.questions])
      .join('\n')
      .toLowerCase();
    expect(all).not.toContain('démocratie libérale');
  });
});
