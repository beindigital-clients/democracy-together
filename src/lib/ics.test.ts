import { describe, expect, it } from 'vitest';
import { eventToIcs } from './ics';

const FIXED_NOW = new Date(Date.UTC(2026, 0, 2, 9, 30, 0)); // 2026-01-02T09:30:00Z

describe('eventToIcs', () => {
  it('produit une enveloppe VCALENDAR + VEVENT bien formée', () => {
    const ics = eventToIcs(
      {
        uid: 'conference-inaugurale@democracy-together.org',
        start: { y: 2026, mo: 11, d: 14 },
        title: 'Conference inaugurale',
      },
      FIXED_NOW,
    );

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('PRODID:');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
    // Ordre correct : VEVENT fermé avant VCALENDAR.
    expect(ics.indexOf('END:VEVENT')).toBeLessThan(
      ics.indexOf('END:VCALENDAR'),
    );
  });

  it('inclut un UID', () => {
    const ics = eventToIcs(
      { uid: 'evt-123', start: { y: 2026, mo: 1, d: 1 }, title: 'Test' },
      FIXED_NOW,
    );
    expect(ics).toContain('UID:evt-123');
  });

  it('formate DTSTART;VALUE=DATE en YYYYMMDD (zéro-paddé)', () => {
    const ics = eventToIcs(
      { uid: 'u', start: { y: 2026, mo: 9, d: 7 }, title: 'Test' },
      FIXED_NOW,
    );
    expect(ics).toContain('DTSTART;VALUE=DATE:20260907');
  });

  it('pose DTEND au lendemain (événement journée entière, fin exclusive)', () => {
    const ics = eventToIcs(
      { uid: 'u', start: { y: 2026, mo: 11, d: 14 }, title: 'Test' },
      FIXED_NOW,
    );
    expect(ics).toContain('DTSTART;VALUE=DATE:20261114');
    expect(ics).toContain('DTEND;VALUE=DATE:20261115');
  });

  it('gère le passage de mois pour DTEND', () => {
    const ics = eventToIcs(
      { uid: 'u', start: { y: 2026, mo: 1, d: 31 }, title: 'Test' },
      FIXED_NOW,
    );
    expect(ics).toContain('DTEND;VALUE=DATE:20260201');
  });

  it('échappe la virgule du SUMMARY en \\,', () => {
    const ics = eventToIcs(
      {
        uid: 'u',
        start: { y: 2026, mo: 1, d: 1 },
        title: 'Atelier de Dakar, transparence',
      },
      FIXED_NOW,
    );
    expect(ics).toContain('SUMMARY:Atelier de Dakar\\, transparence');
  });

  it('échappe point-virgule, backslash et saut de ligne dans DESCRIPTION', () => {
    const ics = eventToIcs(
      {
        uid: 'u',
        start: { y: 2026, mo: 1, d: 1 },
        title: 'T',
        description: 'a; b\\c\nd',
      },
      FIXED_NOW,
    );
    expect(ics).toContain('DESCRIPTION:a\\; b\\\\c\\nd');
  });

  it('inclut LOCATION et URL quand fournis, les omet sinon', () => {
    const withExtras = eventToIcs(
      {
        uid: 'u',
        start: { y: 2026, mo: 1, d: 1 },
        title: 'T',
        location: 'Paris',
        url: 'https://example.org/e',
      },
      FIXED_NOW,
    );
    expect(withExtras).toContain('LOCATION:Paris');
    expect(withExtras).toContain('URL:https://example.org/e');

    const minimal = eventToIcs(
      { uid: 'u', start: { y: 2026, mo: 1, d: 1 }, title: 'T' },
      FIXED_NOW,
    );
    expect(minimal).not.toContain('LOCATION:');
    expect(minimal).not.toContain('URL:');
    expect(minimal).not.toContain('DESCRIPTION:');
  });

  it('produit un DTSTAMP UTC déterministe et joint les lignes par CRLF', () => {
    const ics = eventToIcs(
      { uid: 'u', start: { y: 2026, mo: 1, d: 1 }, title: 'T' },
      FIXED_NOW,
    );
    expect(ics).toContain('DTSTAMP:20260102T093000Z');
    expect(ics).toContain('\r\n');
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR');
  });

  it("n'écrit jamais le terme banni (FR/EN)", () => {
    const ics = eventToIcs(
      {
        uid: 'u',
        start: { y: 2026, mo: 1, d: 1 },
        title: 'Conference',
        description: 'Democracy Together',
      },
      FIXED_NOW,
    ).toLowerCase();
    expect(ics).not.toContain('démocratie libérale');
    expect(ics).not.toContain('democratie liberale');
    expect(ics).not.toContain('liberal democracy');
  });
});
