import { test, expect, type APIRequestContext } from '@playwright/test';

// Structured data per page (P1 no. 4 of the action plan) — read from the
// SERVED HTML, via a plain HTTP request and without a browser: this is exactly what
// a search crawler has. A record set by JavaScript would be
// invisible here, and that is the point.
//
// Rule these guards uphold: a record only declares what the page
// shows. Hence absences are checked as much as presences.

type Fiche = Record<string, unknown>;

const BLOC =
  /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;

async function fiches(
  request: APIRequestContext,
  url: string,
): Promise<Fiche[]> {
  const res = await request.get(url);
  expect(res.status(), `${url} : statut`).toBe(200);
  const html = await res.text();
  const out: Fiche[] = [];
  for (const m of html.matchAll(BLOC)) {
    // An unreadable block is a FAILURE, not an absence: confusing the two would
    // read a broken record as "no record".
    let lu: unknown;
    try {
      lu = JSON.parse(m[1]);
    } catch (e) {
      throw new Error(`${url} : bloc ld+json illisible`, { cause: e });
    }
    out.push(lu as Fiche);
  }
  return out;
}

const parType = (f: Fiche[], type: string) =>
  f.filter((x) => x['@type'] === type);

// Entities React emits in text. Replaced in ONE single pass: decoding
// `&amp;` separately would turn `&amp;lt;` into `<`, which would be wrong.
const ENTITES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#x27;': "'",
  '&#39;': "'",
};

/**
 * The page's VISIBLE title, read from the served HTML.
 *
 * No tag stripping here, and that is deliberate: a hand-written
 * sanitizer is wrong by construction — a single pass of `<[^>]*>` lets
 * `<scr<span>ipt>` come through, and CodeQL is right to flag it. These `<h1>`
 * are plain text; we ASSERT it instead of assuming it, and the day
 * one of them carries markup, this test will say so rather than silently
 * comparing truncated strings.
 */
async function h1(request: APIRequestContext, url: string): Promise<string> {
  const html = await (await request.get(url)).text();
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const brut = m?.[1] ?? '';
  expect(brut, `${url} : <h1> attendu en texte simple`).not.toContain('<');
  return brut
    .replace(/&(?:amp|lt|gt|quot|#x27|#39);/g, (e) => ENTITES[e])
    .trim();
}

const CONFERENCE = '/fr/evenements/conference-inaugurale';
const WEBINAIRE = '/fr/evenements/webinaire-gouvernance-plateformes';
const ATELIER = '/fr/evenements/atelier-dakar-transparence-budgetaire';

test.describe('Données structurées servies', () => {
  test('TÉMOIN — le lecteur discrimine : la page de LISTE ne porte aucun Event', async ({
    request,
  }) => {
    // Without this test, a function that always returns `[]` would pass all
    // the absence guards, and one that returns everything would pass the
    // presence ones. This one requires both at once on a page whose
    // answer we know: the organization YES, the event NO.
    const f = await fiches(request, '/fr/evenements');
    expect(parType(f, 'Organization'), 'organisation du layout').toHaveLength(
      1,
    );
    expect(parType(f, 'Event'), 'aucune fiche Event sur la liste').toHaveLength(
      0,
    );
  });

  test('une page d’événement porte sa fiche Event dans le HTML servi', async ({
    request,
  }) => {
    const [ev] = parType(await fiches(request, CONFERENCE), 'Event');
    expect(ev, 'fiche Event absente du HTML servi').toBeTruthy();
    expect(ev['@context']).toBe('https://schema.org');
    expect(ev.url).toContain('/fr/evenements/conference-inaugurale');
  });

  test('la fiche nomme ce que la page AFFICHE en <h1>', async ({ request }) => {
    // The batch's rule, made mechanical: if the visible title changes without
    // the record following, this test says so.
    const [ev] = parType(await fiches(request, CONFERENCE), 'Event');
    expect(ev.name).toBe(await h1(request, CONFERENCE));
  });

  test('un événement d’un jour commence et finit le MÊME jour', async ({
    request,
  }) => {
    const [ev] = parType(await fiches(request, CONFERENCE), 'Event');
    expect(ev.startDate).toBe('2026-11-14');
    // schema.org's `endDate` is INCLUSIVE, whereas the iCalendar `DTEND`
    // served by the same page designates the next day. Both are checked
    // here, side by side: aligning one on the other turns it red.
    expect(ev.endDate).toBe('2026-11-14');

    const ics = await (
      await request.get('/fr/evenements/conference-inaugurale/agenda.ics')
    ).text();
    expect(ics).toContain('DTSTART;VALUE=DATE:20261114');
    expect(ics).toContain('DTEND;VALUE=DATE:20261115');
  });

  test('le lieu suit le format RÉEL de chaque événement', async ({
    request,
  }) => {
    const fiche = async (url: string) =>
      parType(await fiches(request, url), 'Event')[0];

    const hybride = await fiche(CONFERENCE);
    expect(hybride.eventAttendanceMode).toBe(
      'https://schema.org/MixedEventAttendanceMode',
    );
    expect(Array.isArray(hybride.location)).toBe(true);

    const enLigne = await fiche(WEBINAIRE);
    expect(enLigne.eventAttendanceMode).toBe(
      'https://schema.org/OnlineEventAttendanceMode',
    );
    // A webinar has no city: declaring it as a `Place` would amount to
    // inventing an address.
    expect((enLigne.location as Fiche)['@type']).toBe('VirtualLocation');

    const presentiel = await fiche(ATELIER);
    expect(presentiel.eventAttendanceMode).toBe(
      'https://schema.org/OfflineEventAttendanceMode',
    );
    expect((presentiel.location as Fiche)['@type']).toBe('Place');
  });

  test('le renvoi vers l’organisation SE RÉSOUT sur la même page', async ({
    request,
  }) => {
    // The Event record does not copy the organization, it references it. The
    // reference is therefore only valid if the layout does place its record here too: we
    // check it rather than rely on it.
    const f = await fiches(request, CONFERENCE);
    const [org] = parType(f, 'Organization');
    const [ev] = parType(f, 'Event');
    expect(org, 'organisation absente : le renvoi pendrait').toBeTruthy();
    expect((ev.organizer as Fiche)['@id']).toBe(org['@id']);
  });

  test('ni image, ni tarif, ni intervenant déclarés', async ({ request }) => {
    // The page serves the same photo for every event and says so
    // itself ("Image d'illustration"); its prices are fictitious.
    const [ev] = parType(await fiches(request, CONFERENCE), 'Event');
    expect(Object.keys(ev)).not.toContain('image');
    expect(Object.keys(ev)).not.toContain('offers');
    expect(Object.keys(ev)).not.toContain('performer');
  });

  test('la version anglaise porte SON adresse et SON titre', async ({
    request,
  }) => {
    const EN = '/en/evenements/conference-inaugurale';
    const [ev] = parType(await fiches(request, EN), 'Event');
    expect(ev.url).toContain(EN);
    expect(ev.name).toBe(await h1(request, EN));
  });

  test('CMS injoignable : la page d’actualité ne déclare AUCUN article', async ({
    request,
  }) => {
    // State measured here: Sanity has no configured project, so the page renders
    // its degraded panel. An `Article` record there would describe content the
    // page does not serve — and the page already carries a `noindex` for the same
    // reason. The day a CMS is plugged in, this test will need revisiting:
    // that is intended, it DATES the state of the dependency.
    const url = '/fr/actualites/nimporte-quel-slug';
    const html = await (await request.get(url)).text();
    expect(html, 'rendu dégradé attendu').toMatch(/noindex/);

    const f = await fiches(request, url);
    expect(parType(f, 'Article'), 'aucune fiche Article').toHaveLength(0);
    // The organization, on the other hand, stays: the layout sets it.
    expect(parType(f, 'Organization')).toHaveLength(1);
  });
});
