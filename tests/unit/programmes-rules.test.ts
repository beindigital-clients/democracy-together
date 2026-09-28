import { describe, it, expect } from 'vitest';
import {
  WEEK_MS,
  callWindowState,
  certificateCode,
  isPairInactive,
  isStepUrl,
  rankApplications,
  rankMatches,
  scoreMatch,
  sniffFileType,
  weightedScore,
  utcToZonedInput,
  zonedInputToUtc,
} from '@convex/lib/programmes';

// Pure rules of the "programmes" workstream (convex/lib/programmes.ts), without
// Convex: what the mutations enforce and what the interface displays.

describe('Score d’appariement (F-59)', () => {
  const mentee = {
    themes: ['participation', 'crises'],
    languages: ['fr'],
    region: 'afrique-ouest',
    utcOffset: 0,
  };

  it('somme des raisons, bornée à 100', () => {
    const s = scoreMatch(
      {
        ...mentee,
        themes: ['participation', 'crises', 'transitions', 'anti-corruption'],
      },
      {
        themes: ['participation', 'crises', 'transitions', 'anti-corruption'],
        languages: ['fr'],
        region: 'afrique-ouest',
        capacity: 3,
        activePairs: 0,
      },
    );
    // Four shared themes cap at 45.
    expect(s.reasons[0].points).toBe(45);
    expect(s.score).toBe(100);
    expect(s.eligible).toBe(true);
  });

  it('sans langue commune ni région, le fuseau départage', () => {
    const s = scoreMatch(mentee, {
      themes: [],
      languages: ['en'],
      region: 'europe-est',
      utcOffset: 5,
      capacity: 2,
      activePairs: 1,
    });
    expect(s.reasons).toEqual([
      { kind: 'themes', points: 0, values: [] },
      { kind: 'language', points: 0, values: [] },
      { kind: 'timezone', points: 5, hours: 5 },
      { kind: 'load', points: 8, active: 1, capacity: 2 },
    ]);
    expect(s.score).toBe(13);
  });

  it('un mentor plein n’est pas éligible ; l’égalité se départage par identifiant', () => {
    const full = scoreMatch(mentee, {
      ...mentee,
      capacity: 1,
      activePairs: 1,
    });
    expect(full.eligible).toBe(false);
    const same = scoreMatch(mentee, { ...mentee, capacity: 2, activePairs: 0 });
    const ranked = rankMatches([
      { id: 'b', score: same },
      { id: 'c', score: full },
      { id: 'a', score: same },
    ]);
    expect(ranked.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('Inactivité d’un binôme', () => {
  const now = 100 * WEEK_MS;
  it('alerte après quatre semaines, une fois par période', () => {
    const pair = { status: 'active' as const, startedAt: now - 10 * WEEK_MS };
    expect(
      isPairInactive({ ...pair, lastSessionAt: now - 3 * WEEK_MS }, now),
    ).toBe(false);
    expect(
      isPairInactive({ ...pair, lastSessionAt: now - 5 * WEEK_MS }, now),
    ).toBe(true);
    expect(
      isPairInactive(
        {
          ...pair,
          lastSessionAt: now - 5 * WEEK_MS,
          inactivityAlertAt: now - WEEK_MS,
        },
        now,
      ),
    ).toBe(false);
    expect(
      isPairInactive(
        {
          ...pair,
          lastSessionAt: now - 9 * WEEK_MS,
          inactivityAlertAt: now - 4 * WEEK_MS,
        },
        now,
      ),
    ).toBe(true);
    expect(isPairInactive({ ...pair, status: 'paused' }, now)).toBe(false);
  });
});

describe('Fenêtre d’un appel (F-60)', () => {
  it('ouverture incluse, clôture exclue', () => {
    const call = { opensAt: 1000, closesAt: 2000 };
    expect(callWindowState(call, 999)).toBe('upcoming');
    expect(callWindowState(call, 1000)).toBe('open');
    expect(callWindowState(call, 1999)).toBe('open');
    expect(callWindowState(call, 2000)).toBe('closed');
  });
});

describe('Reconnaissance du contenu des pièces', () => {
  it('lit les octets de tête, pas l’extension', () => {
    expect(sniffFileType(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe(
      'application/pdf',
    );
    expect(sniffFileType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      'image/jpeg',
    );
    expect(
      sniffFileType(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe('image/png');
    expect(sniffFileType(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(
      'application/zip',
    );
    expect(sniffFileType(new Uint8Array([0x4d, 0x5a]))).toBeNull();
    expect(sniffFileType(new Uint8Array([]))).toBeNull();
  });
});

describe('Évaluation et classement', () => {
  const criteria = [
    { key: 'a', label: 'A', weight: 2 },
    { key: 'b', label: 'B', weight: 1 },
  ];
  it('note pondérée sur 100, grille incomplète refusée', () => {
    expect(
      weightedScore(criteria, [
        { criterionKey: 'a', score: 5 },
        { criterionKey: 'b', score: 2 },
      ]),
    ).toBe(80);
    expect(
      weightedScore(criteria, [{ criterionKey: 'a', score: 5 }]),
    ).toBeNull();
  });
  it('exclut les conflits et classe sans note en dernier', () => {
    const ranked = rankApplications([
      { id: 'x', evaluations: [] },
      {
        id: 'y',
        evaluations: [
          { conflict: true, score: null },
          { conflict: false, score: 60 },
        ],
      },
      { id: 'z', evaluations: [{ conflict: false, score: 90 }] },
    ]);
    expect(ranked).toEqual([
      { id: 'z', average: 90, evaluations: 1, excluded: 0, rank: 1 },
      { id: 'y', average: 60, evaluations: 1, excluded: 1, rank: 2 },
      { id: 'x', average: null, evaluations: 0, excluded: 0, rank: 3 },
    ]);
  });
});

describe('Parcours (F-57)', () => {
  it('code d’attestation stable et lisible', () => {
    expect(certificateCode('abc', 42)).toBe(certificateCode('abc', 42));
    expect(certificateCode('abc', 42)).not.toBe(certificateCode('abc', 43));
    expect(certificateCode('abc', 42)).toMatch(/^DT-[0-9A-F]{4}-[0-9A-F]{4}$/);
  });
  it('adresse d’étape : interne ou http(s), rien d’autre', () => {
    expect(isStepUrl('/replays/consultation')).toBe(true);
    expect(isStepUrl('https://example.org/x')).toBe(true);
    expect(isStepUrl('//evil.example')).toBe(false);
    expect(isStepUrl('javascript:alert(1)')).toBe(false);
    expect(isStepUrl('data:text/html,x')).toBe(false);
  });
});

describe('Heure d’un fuseau (saisie des appels)', () => {
  it('convertit l’heure murale d’un fuseau en UTC et retour', () => {
    // Dakar = UTC all year round.
    expect(zonedInputToUtc('2026-11-30T18:00', 'Africa/Dakar')).toBe(
      Date.UTC(2026, 10, 30, 18, 0),
    );
    // Brussels in winter (UTC+1) and in summer (UTC+2).
    expect(zonedInputToUtc('2026-01-15T09:30', 'Europe/Brussels')).toBe(
      Date.UTC(2026, 0, 15, 8, 30),
    );
    expect(zonedInputToUtc('2026-07-15T09:30', 'Europe/Brussels')).toBe(
      Date.UTC(2026, 6, 15, 7, 30),
    );
    expect(
      utcToZonedInput(Date.UTC(2026, 6, 15, 7, 30), 'Europe/Brussels'),
    ).toBe('2026-07-15T09:30');
    expect(Number.isNaN(zonedInputToUtc('demain', 'UTC'))).toBe(true);
  });
});
