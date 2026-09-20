import { describe, it, expect } from 'vitest';
import { EMAIL_RE, isEmail, formField } from '@/lib/validation';
import * as serveur from '@convex/lib/validation';

// `isEmail` filtre l'adresse de CHAQUE formulaire du site — adhésion, contact,
// newsletter, invitation, inscription jeunesse, mentorat, rappel d'événement,
// et les trois écrans de connexion. Rien ne la couvrait.
//
// Deux choses se jouent ici, et une seule est un détail de regex :
//
//   1. CE QUI PASSE. Trop permissif, le serveur reçoit des adresses qui
//      n'aboutiront jamais (un code de connexion parti dans le vide) ; trop
//      strict, un membre légitime est refusé à la porte par son propre
//      formulaire.
//   2. LA SYNCHRONIE. La règle est écrite DEUX FOIS — ici et dans
//      convex/lib/validation.ts — parce que la frontière Convex/Next interdit
//      un module unique. Les deux fichiers le disent en commentaire ; aucun ne
//      l'imposait. Une divergence donnerait le pire des cas : un formulaire qui
//      accepte ce que le serveur rejette (erreur incompréhensible côté membre)
//      ou l'inverse (validation client qui ne sert plus à rien).

const VALIDES = [
  'membre@institut-sahel.org',
  'a@b.co',
  'prenom.nom@sous.domaine.example.org',
  'prenom+etiquette@example.org',
  "o'brien@example.org",
  'e2e_session_admin@dt.test',
];

const INVALIDES = [
  '', // champ laissé vide
  'membre', // pas d'arobase
  'membre@example', // pas de point dans le domaine
  '@example.org', // pas de partie locale
  'membre@', // pas de domaine
  'membre@@example.org', // deux arobases
  'membre@exemple.org autre@exemple.org', // deux adresses collées
  'prenom nom@example.org', // espace dans la partie locale
  'membre@exem ple.org', // espace dans le domaine
  'membre@.org', // domaine vide avant le point
];

describe('isEmail — le filtre de tous les formulaires', () => {
  it.each(VALIDES)('accepte %s', (value) => {
    expect(isEmail(value)).toBe(true);
  });

  it.each(INVALIDES)('refuse %o', (value) => {
    expect(isEmail(value)).toBe(false);
  });

  // Un copier-coller depuis un client de messagerie traîne presque toujours une
  // espace ou un saut de ligne. La refuser ferait échouer une adresse correcte
  // sur un caractère que l'utilisateur ne voit même pas.
  it('ignore les espaces autour de la saisie', () => {
    expect(isEmail('  membre@institut-sahel.org  ')).toBe(true);
    expect(isEmail('\tmembre@institut-sahel.org\n')).toBe(true);
  });

  // …mais l'espace INTÉRIEURE reste un refus : c'est une autre adresse, pas un
  // artefact de collage.
  it("ne rattrape pas une espace à l'intérieur de l'adresse", () => {
    expect(isEmail('  prenom nom@example.org  ')).toBe(false);
  });

  it('ancre la règle aux deux bouts (pas de correspondance partielle)', () => {
    // Sans `^`/`$`, une chaîne qui CONTIENT une adresse passerait — la porte
    // ouverte à un en-tête injecté dans un champ de formulaire.
    expect(isEmail('Nom <membre@example.org>')).toBe(false);
    expect(isEmail('membre@example.org\nBcc: tiers@example.org')).toBe(false);
  });
});

describe('Validation — le client et le serveur appliquent la MÊME règle', () => {
  // Deux fichiers, une seule règle : on compare les décisions, pas les sources.
  // Une réécriture équivalente de la regex reste donc verte ; une divergence de
  // COMPORTEMENT, seule chose qui casse un formulaire, ne l'est pas.
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

  // `EMAIL_RE` est exportée et réutilisée telle quelle (attribut `pattern` d'un
  // <input>, validations dérivées). Un drapeau `g` la rendrait à état : `test()`
  // alternerait vrai/faux sur la MÊME adresse d'un appel à l'autre, et un
  // formulaire refuserait une saisie sur deux sans que rien ne le trahisse.
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

  // Le piège que la fonction existe pour éviter : `String(fd.get(name))` rend
  // la CHAÎNE « null » sur un champ absent — cinq caractères, non vides, qui
  // passent tous les tests de présence et finissent en base.
  it('rend la chaîne vide sur un champ absent (jamais « null »)', () => {
    const fd = new FormData();
    expect(formField(fd, 'email')).toBe('');
    expect(formField(fd, 'email')).not.toBe('null');
  });

  // Même piège avec un fichier : `String(File)` rend « [object File] ».
  it('rend la chaîne vide sur un champ fichier (jamais « [object File] »)', () => {
    const fd = new FormData();
    fd.set('email', new File(['contenu'], 'piece.pdf'));
    expect(formField(fd, 'email')).toBe('');
  });

  // Les appelants enchaînent `formField(fd, 'email').trim()` : la fonction doit
  // rendre une VRAIE chaîne dans tous les cas, sinon `.trim()` lève.
  it('rend toujours une chaîne, donc `.trim()` ne lève jamais', () => {
    const fd = new FormData();
    fd.set('fichier', new File([''], 'vide.pdf'));
    for (const nom of ['fichier', 'absent']) {
      expect(() => formField(fd, nom).trim()).not.toThrow();
      expect(typeof formField(fd, nom)).toBe('string');
    }
  });

  it('préserve les espaces : c’est à l’appelant de couper', () => {
    // `isEmail` coupe pour son verdict, mais la valeur STOCKÉE vient d'ici :
    // couper en douce ferait diverger ce qui est validé de ce qui est envoyé.
    const fd = new FormData();
    fd.set('name', '  Aïcha Diallo  ');
    expect(formField(fd, 'name')).toBe('  Aïcha Diallo  ');
  });
});
