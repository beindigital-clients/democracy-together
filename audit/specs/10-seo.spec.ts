import { test, expect } from '@playwright/test';
import { PUBLIQUES } from './_routes';

// Lecture des métadonnées en UNE évaluation : pas de locator, donc pas
// d'attente de 45 s quand une balise est absente — l'absence est le résultat.
type Meta = {
  lang: string | null;
  title: string;
  description: string | null;
  canonical: string | null;
  hreflang: string[];
  ogTitle: string | null;
  ogImage: string | null;
  ogUrl: string | null;
  h1: number;
  imgSansAlt: number;
  jsonLd: number;
  robots: string | null;
};

for (const locale of ['fr', 'en'] as const) {
  for (const route of PUBLIQUES) {
    test(`SEO ${locale}${route || '/'}`, async ({ page }) => {
      const url = `/${locale}${route}`;
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded' });
      expect(resp?.status(), `${url} : statut`).toBe(200);

      const m: Meta = await page.evaluate(() => {
        const attr = (sel: string, a: string) =>
          document.querySelector(sel)?.getAttribute(a) ?? null;
        return {
          lang: document.documentElement.getAttribute('lang'),
          title: document.title,
          description: attr('meta[name="description"]', 'content'),
          canonical: attr('link[rel="canonical"]', 'href'),
          hreflang: [
            ...document.querySelectorAll('link[rel="alternate"][hreflang]'),
          ].map((l) => l.getAttribute('hreflang') as string),
          ogTitle: attr('meta[property="og:title"]', 'content'),
          ogImage: attr('meta[property="og:image"]', 'content'),
          ogUrl: attr('meta[property="og:url"]', 'content'),
          h1: document.querySelectorAll('h1').length,
          imgSansAlt: document.querySelectorAll('img:not([alt])').length,
          jsonLd: document.querySelectorAll(
            'script[type="application/ld+json"]',
          ).length,
          robots: attr('meta[name="robots"]', 'content'),
        };
      });

      console.log(`[seo] ${url} ${JSON.stringify(m)}`);

      expect(m.lang, `${url} : attribut lang`).toBe(locale);
      expect(m.title.trim().length, `${url} : <title> vide`).toBeGreaterThan(0);
      expect(m.description, `${url} : meta description absente`).toBeTruthy();
      // Une page en `noindex` est EXCLUE de ces deux exigences, et ce n'est
      // pas une tolérance : le dépôt a tranché (issue #35, testé dans
      // tests/e2e/seo.spec.ts) qu'un moteur ignore le hreflang sur une telle
      // page et que l'y poser ne serait que du bruit. Ma première version de
      // cette spec l'exigeait partout — elle a signalé `/recherche` à tort.
      const noindex = /noindex/.test(m.robots ?? '');
      if (!noindex) {
        expect(m.canonical, `${url} : canonical absent`).toBeTruthy();
        expect(m.hreflang, `${url} : hreflang fr`).toContain('fr');
        expect(m.hreflang, `${url} : hreflang en`).toContain('en');
      } else {
        expect(
          m.hreflang,
          `${url} : hreflang posé sur une page noindex`,
        ).toEqual([]);
      }
      // Présent NE SUFFIT PAS : un og:title figé au nom du site ferait
      // apparaître toutes les pages partagées sous le même titre.
      expect(m.ogTitle, `${url} : og:title absent`).toBeTruthy();
      expect(
        m.ogTitle,
        `${url} : og:title ne suit pas le titre de la page`,
      ).toBe(m.title);
      expect(m.ogImage, `${url} : og:image absente`).toBeTruthy();
      expect(m.jsonLd, `${url} : aucune donnée structurée`).toBeGreaterThan(0);
      // og:url épinglé sur une autre page vaut mieux absent : un agrégateur
      // peut le prendre pour l'adresse canonique.
      if (m.ogUrl) {
        expect(m.ogUrl, `${url} : og:url épinglé ailleurs`).toContain(
          route || '/',
        );
      }
      expect(m.h1, `${url} : ${m.h1} <h1> au lieu d'un seul`).toBe(1);
      expect(m.imgSansAlt, `${url} : ${m.imgSansAlt} image(s) sans alt`).toBe(
        0,
      );
    });
  }
}
