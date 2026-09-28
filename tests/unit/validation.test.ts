import { describe, it, expect } from 'vitest';
import { EMAIL_RE, isEmail, formField } from '@/lib/validation';
import * as serveur from '@convex/lib/validation';

// `isEmail` filters the address of EVERY form on the site — membership, contact,
// newsletter, invitation, youth signup, mentoring, event reminder,
// and the three sign-in screens. Nothing covered it.
//
// Two things are at stake here, and only one is a regex detail:
//
//   1. WHAT GETS THROUGH. Too permissive, and the server receives addresses that
//      will never work (a sign-in code sent into the void); too
//      strict, and a legitimate member is turned away at the door by their own
//      form.
//   2. SYNCHRONY. The rule is written TWICE — here and in
//      convex/lib/validation.ts — because the Convex/Next boundary forbids
//      a single module. Both files say so in a comment; neither
//      enforced it. A divergence would produce the worst case: a form that
//      accepts what the server rejects (an incomprehensible error for the member)
//      or the reverse (client validation that no longer serves any purpose).

const VALIDES = [
  'membre@institut-sahel.org',
  'a@b.co',
  'prenom.nom@sous.domaine.example.org',
  'prenom+etiquette@example.org',
  "o'brien@example.org",
  'e2e_session_admin@dt.test',
];

const INVALIDES = [
  '', // field left empty
  'membre', // no at sign
  'membre@example', // no dot in the domain
  '@example.org', // no local part
  'membre@', // no domain
  'membre@@example.org', // two at signs
  'membre@exemple.org autre@exemple.org', // two addresses stuck together
  'prenom nom@example.org', // space in the local part
  'membre@exem ple.org', // space in the domain
  'membre@.org', // empty domain before the dot
];

describe('isEmail — le filtre de tous les formulaires', () => {
  it.each(VALIDES)('accepte %s', (value) => {
    expect(isEmail(value)).toBe(true);
  });

  it.each(INVALIDES)('refuse %o', (value) => {
    expect(isEmail(value)).toBe(false);
  });

  // A copy-paste from an email client almost always drags along a
  // space or a line break. Refusing it would make a correct address fail
  // on a character the user cannot even see.
  it('ignore les espaces autour de la saisie', () => {
    expect(isEmail('  membre@institut-sahel.org  ')).toBe(true);
    expect(isEmail('\tmembre@institut-sahel.org\n')).toBe(true);
  });

  // …but an INNER space is still a refusal: it is a different address, not a
  // paste artifact.
  it("ne rattrape pas une espace à l'intérieur de l'adresse", () => {
    expect(isEmail('  prenom nom@example.org  ')).toBe(false);
  });

  it('ancre la règle aux deux bouts (pas de correspondance partielle)', () => {
    // Without `^`/`$`, a string that CONTAINS an address would get through — opening
    // the door to a header injected into a form field.
    expect(isEmail('Nom <membre@example.org>')).toBe(false);
    expect(isEmail('membre@example.org\nBcc: tiers@example.org')).toBe(false);
  });
});

describe('Validation — le client et le serveur appliquent la MÊME règle', () => {
  // Two files, a single rule: we compare the decisions, not the sources.
  // An equivalent rewrite of the regex therefore stays green; a divergence in
  // BEHAVIOR, the only thing that breaks a form, does not.
  it.each([...VALIDES, ...INVALIDES])(
    'rend le même verdict sur %o',
    (value) => {
      expect(serveur.isEmail(value)).toBe(isEmail(value));
    },
  );

  it('expose la même expression régulière', () => {
    expect(serveur.EMAIL_RE.source).toBe(EMAIL_RE.source);
    expect(serveur.EMAIL_RE.flags).toBe(EMAIL_RE.flags);
  });

  // `EMAIL_RE` is exported and reused as is (the `pattern` attribute of an
  // <input>, derived validations). A `g` flag would make it stateful: `test()`
  // would alternate true/false on the SAME address from one call to the next, and a
  // form would reject every other input without anything giving it away.
  it("n'est pas globale (sinon `test()` alternerait d'un appel à l'autre)", () => {
    expect(EMAIL_RE.global).toBe(false);
    const adresse = 'membre@institut-sahel.org';
    expect([1, 2, 3].map(() => isEmail(adresse))).toEqual([true, true, true]);
  });
});

describe('formField — lecture d’un champ texte de formulaire', () => {
  it('rend la valeur saisie', () => {
    const fd = new FormData();
    fd.set('email', 'membre@institut-sahel.org');
    expect(formField(fd, 'email')).toBe('membre@institut-sahel.org');
  });

  // The trap the function exists to avoid: `String(fd.get(name))` returns
  // the STRING "null" for a missing field — five characters, non-empty, that
  // pass every presence check and end up in the database.
  it('rend la chaîne vide sur un champ absent (jamais « null »)', () => {
    const fd = new FormData();
    expect(formField(fd, 'email')).toBe('');
    expect(formField(fd, 'email')).not.toBe('null');
  });

  // Same trap with a file: `String(File)` returns "[object File]".
  it('rend la chaîne vide sur un champ fichier (jamais « [object File] »)', () => {
    const fd = new FormData();
    fd.set('email', new File(['contenu'], 'piece.pdf'));
    expect(formField(fd, 'email')).toBe('');
  });

  // Callers chain `formField(fd, 'email').trim()`: the function must
  // return a REAL string in every case, otherwise `.trim()` throws.
  it('rend toujours une chaîne, donc `.trim()` ne lève jamais', () => {
    const fd = new FormData();
    fd.set('fichier', new File([''], 'vide.pdf'));
    for (const nom of ['fichier', 'absent']) {
      expect(() => formField(fd, nom).trim()).not.toThrow();
      expect(typeof formField(fd, nom)).toBe('string');
    }
  });

  it('préserve les espaces : c’est à l’appelant de couper', () => {
    // `isEmail` trims for its verdict, but the STORED value comes from here:
    // trimming quietly would make what is validated diverge from what is sent.
    const fd = new FormData();
    fd.set('name', '  Aïcha Diallo  ');
    expect(formField(fd, 'name')).toBe('  Aïcha Diallo  ');
  });
});
