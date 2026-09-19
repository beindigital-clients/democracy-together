import { describe, it, expect } from 'vitest';
import { parseConvexRunOutput } from '../e2e/_convex-output';

// La sortie réelle de `npx convex run` pour une requête qui renvoie un objet.
// C'est le cas que l'ancienne lecture (dernière ligne) ne savait pas traiter.
const OBJET = `{
  "handled": false,
  "name": "Awa Diop",
  "subject": "Partenariat think tank"
}`;

describe('parseConvexRunOutput', () => {
  it('lit un objet imprimé sur plusieurs lignes', () => {
    expect(parseConvexRunOutput(OBJET)).toEqual({
      handled: false,
      name: 'Awa Diop',
      subject: 'Partenariat think tank',
    });
  });

  it('lit un objet précédé de lignes de log', () => {
    const out = `⚠ Déploiement de préversion « e2e-69 »\nlog: exécution\n${OBJET}`;
    expect(parseConvexRunOutput<{ subject: string }>(out)?.subject).toBe(
      'Partenariat think tank',
    );
  });

  it('lit un objet suivi de lignes de log', () => {
    expect(
      parseConvexRunOutput<{ name: string }>(`${OBJET}\nterminé.`)?.name,
    ).toBe('Awa Diop');
  });

  // Ce sont les formes qui fonctionnaient déjà : elles ne doivent pas régresser.
  it('lit un scalaire (code OTP)', () => {
    expect(parseConvexRunOutput('"749983"')).toBe('749983');
  });

  it('lit un booléen', () => {
    expect(parseConvexRunOutput('true')).toBe(true);
  });

  it('lit un tableau', () => {
    expect(parseConvexRunOutput('[\n  1,\n  2\n]')).toEqual([1, 2]);
  });

  it('rend null sur une absence de résultat', () => {
    expect(parseConvexRunOutput('null')).toBeNull();
  });

  it('rend null sur une sortie non JSON', () => {
    expect(parseConvexRunOutput('erreur : fonction introuvable')).toBeNull();
  });

  it('rend null sur une sortie vide', () => {
    expect(parseConvexRunOutput('   ')).toBeNull();
  });
});
