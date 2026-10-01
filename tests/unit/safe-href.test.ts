import { describe, it, expect } from 'vitest';
import { safeHref } from '@/lib/safe-href';

// LINKS COMING FROM OUTSIDE THE CODE (pentest M-9): a directory profile's
// `websiteUrl`, placed in an `href` by /le-reseau/[slug], a partner's link and
// the toolbox resources. All go through `safeHref`.
//
// What the pentest targeted, plus the variants that a hand-written prefix test
// would let through: mixed case, leading space, tab
// INSERTED INTO the scheme (browsers' URL parser strips it, so
// `java\tscript:` executes — but `'java\tscript:'.startsWith('javascript:')`
// is false).
const REFUSES = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  '  javascript:alert(1)',
  'java\tscript:alert(1)',
  'java\nscript:alert(1)',
  'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
  'DATA:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)',
  'file:///etc/passwd',
];

describe('safeHref — la fonction partagée', () => {
  it('refuse tout schéma hors liste, accepte les trois autorisés', () => {
    for (const href of REFUSES) {
      expect(safeHref(href), `accepté à tort : ${JSON.stringify(href)}`).toBe(
        undefined,
      );
    }
    expect(safeHref('https://institut-x.org')).toBe('https://institut-x.org');
    expect(safeHref('mailto:a@b.test')).toBe('mailto:a@b.test');
  });

  it('rend la chaîne ANALYSÉE, pas la chaîne reçue', () => {
    // Leading and trailing spaces are removed: the browser would not
    // strip them from a relative URL, and the link would point elsewhere.
    expect(safeHref('  https://institut-x.org  ')).toBe(
      'https://institut-x.org',
    );
  });

  it('refuse ce qui n’est pas une chaîne, et la chaîne vide', () => {
    // An optional link field arrives as `undefined` when it was never entered.
    expect(safeHref(undefined)).toBe(undefined);
    expect(safeHref(null)).toBe(undefined);
    expect(safeHref(42)).toBe(undefined);
    expect(safeHref('   ')).toBe(undefined);
  });
});
