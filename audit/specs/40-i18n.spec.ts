import { test, expect } from '@playwright/test';
import { PUBLIQUES } from './_routes';

// On EN pages, no exclusively French word may appear in the
// visible text. Deliberately narrow list: words with no English homograph,
// so as to produce no false positives.
const MOTS_FR = [
  'Accueil',
  'Connexion',
  'Rechercher',
  'Inscription',
  'Adhésion',
  'Actualités',
  'Événements',
  'Bibliothèque',
  'Nous contacter',
  'Envoyer',
  'Mentions légales',
  'Accéder',
  'Découvrir',
  'Retour',
  'Chargement',
  'Veuillez',
  'Aucun résultat',
];

for (const route of PUBLIQUES) {
  test(`i18n en${route || '/'}`, async ({ page }) => {
    await page.goto(`/en${route}`, { waitUntil: 'domcontentloaded' });
    const texte = await page.locator('body').innerText();
    const trouves = MOTS_FR.filter((m) => texte.includes(m));
    console.log(
      `[i18n] /en${route || '/'} -> ${trouves.length ? trouves.join(', ') : 'RAS'}`,
    );
    expect(
      trouves,
      `/en${route} : texte français sur une page anglaise`,
    ).toEqual([]);
  });
}
