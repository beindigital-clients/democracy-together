// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ConvexError } from 'convex/values';
import fr from '../../src/messages/fr.json';
import ar from '../../src/messages/ar.json';
import { MatchReasons } from '@/components/mentoring/match-reasons';
import { CheckGroup, programmeErrorCode } from '@/components/programmes/shared';
import { scoreMatch } from '@convex/lib/programmes';

afterEach(cleanup);

// Pure components of the "programmes" workstream: the matching score must be
// READABLE (one line per reason, with its points), in each language; the checkbox
// group must be a real named group.

const reasons = scoreMatch(
  {
    themes: ['participation', 'crises'],
    languages: ['fr'],
    region: 'afrique-ouest',
  },
  {
    themes: ['participation', 'crises'],
    languages: ['fr', 'en'],
    region: 'afrique-ouest',
    capacity: 2,
    activePairs: 1,
  },
);

describe('Score d’appariement expliqué', () => {
  it('dit le total et chaque raison, en français', () => {
    render(
      <NextIntlClientProvider locale="fr" messages={fr}>
        <MatchReasons score={reasons.score} reasons={reasons.reasons} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText('Score d’appariement : 78 / 100')).toBeTruthy();
    expect(
      screen.getByText(
        'Thèmes communs : Crises globales, Participation citoyenne',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Langue commune : Français')).toBeTruthy();
    expect(screen.getByText('Même région : Afrique de l’Ouest')).toBeTruthy();
    expect(screen.getByText(/Charge du mentor : 1/)).toBeTruthy();
    expect(screen.getByText('+30')).toBeTruthy();
  });

  it('se rend en arabe sans clé brute', () => {
    const { container } = render(
      <NextIntlClientProvider locale="ar" messages={ar}>
        <MatchReasons score={reasons.score} reasons={reasons.reasons} />
      </NextIntlClientProvider>,
    );
    expect(container.textContent).toContain('درجة المطابقة');
    expect(container.textContent).not.toMatch(/reason[A-Z]/);
  });
});

describe('Groupe de cases', () => {
  it('est un groupe nommé dont chaque case porte son libellé', () => {
    render(
      <CheckGroup
        legend="Langues"
        options={[
          { value: 'fr', label: 'Français' },
          { value: 'en', label: 'Anglais' },
        ]}
        value={['fr']}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('group', { name: 'Langues' })).toBeTruthy();
    const checked = (name: string) =>
      screen.getByRole('checkbox', { name }).getAttribute('aria-checked');
    expect(checked('Français')).toBe('true');
    expect(checked('Anglais')).toBe('false');
  });
});

describe('Code d’un refus serveur', () => {
  it('lit la donnée d’une ConvexError et reconnaît les gardes de rôle', () => {
    expect(programmeErrorCode(new ConvexError('CALL_CLOSED'))).toBe(
      'CALL_CLOSED',
    );
    expect(
      programmeErrorCode(new Error('Accès refusé : rôle « editeur » requis.')),
    ).toBe('FORBIDDEN');
    expect(
      programmeErrorCode(new Error('Uncaught Error: ALREADY_REVIEWED')),
    ).toBe('ALREADY_REVIEWED');
    expect(programmeErrorCode(null)).toBe('GENERIC');
  });
});
