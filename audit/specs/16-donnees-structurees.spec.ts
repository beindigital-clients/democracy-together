import { test, expect, type APIRequestContext } from '@playwright/test';

// Données structurées par page (P1 n° 4 du plan d'action) — lues dans le HTML
// SERVI, par une simple requête HTTP et sans navigateur : c'est exactement ce
// dont dispose un robot d'indexation. Une fiche posée par JavaScript serait
// invisible ici, et c'est le but.
//
// Règle que ces gardes tiennent : une fiche ne déclare que ce que la page
// montre. D'où les absences vérifiées autant que les présences.

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
    // Un bloc illisible est un ÉCHEC, pas une absence : les confondre ferait
    // lire une fiche cassée comme « pas de fiche ».
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

// Entités que React émet dans du texte. Remplacées en UN seul passage : décoder
// `&amp;` à part rendrait `&amp;lt;` en `<`, ce qui serait faux.
const ENTITES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#x27;': "'",
  '&#39;': "'",
};

/**
 * Le titre VISIBLE de la page, lu dans le HTML servi.
 *
 * Aucun retrait de balises ici, et c'est délibéré : un nettoyeur écrit à la
 * main est faux par construction — un seul passage de `<[^>]*>` laisse
 * ressortir `<scr<span>ipt>`, et CodeQL a raison de le signaler. Ces `<h1>`
 * sont du texte simple ; on l'AFFIRME au lieu de le supposer, et le jour où
 * l'un d'eux portera du balisage, ce test le dira plutôt que de comparer des
 * chaînes amputées en silence.
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
    // Sans ce test, une fonction qui renvoie toujours `[]` passerait toutes
    // les gardes d'absence, et une qui renvoie tout passerait celles de
    // présence. Celui-ci exige les deux à la fois sur une page dont on
    // connaît la réponse : l'organisation OUI, l'événement NON.
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
    // La règle du lot, rendue mécanique : si le titre visible change sans que
    // la fiche suive, ce test le dit.
    const [ev] = parType(await fiches(request, CONFERENCE), 'Event');
    expect(ev.name).toBe(await h1(request, CONFERENCE));
  });

  test('un événement d’un jour commence et finit le MÊME jour', async ({
    request,
  }) => {
    const [ev] = parType(await fiches(request, CONFERENCE), 'Event');
    expect(ev.startDate).toBe('2026-11-14');
    // `endDate` de schema.org est INCLUSIVE, là où le `DTEND` de l'iCalendar
    // servi par la même page désigne le lendemain. Les deux sont vérifiés
    // ici, côte à côte : aligner l'un sur l'autre fait rougir.
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
    // Un webinaire n'a pas de ville : le déclarer comme `Place` reviendrait à
    // inventer une adresse.
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
    // La fiche Event ne recopie pas l'organisation, elle la référence. Le
    // renvoi ne vaut donc que si le layout pose bien sa fiche ici aussi : on
    // le vérifie plutôt que de s'y fier.
    const f = await fiches(request, CONFERENCE);
    const [org] = parType(f, 'Organization');
    const [ev] = parType(f, 'Event');
    expect(org, 'organisation absente : le renvoi pendrait').toBeTruthy();
    expect((ev.organizer as Fiche)['@id']).toBe(org['@id']);
  });

  test('ni image, ni tarif, ni intervenant déclarés', async ({ request }) => {
    // La page sert la même photo pour tous les événements et le dit
    // elle-même (« Image d'illustration ») ; ses tarifs sont fictifs.
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
    // État mesuré ici : Sanity n'a pas de projet configuré, la page rend donc
    // son panneau dégradé. Une fiche `Article` y décrirait un contenu que la
    // page ne sert pas — et la page porte déjà un `noindex` pour la même
    // raison. Le jour où un CMS sera branché, ce test devra être repris :
    // c'est voulu, il DATE l'état de la dépendance.
    const url = '/fr/actualites/nimporte-quel-slug';
    const html = await (await request.get(url)).text();
    expect(html, 'rendu dégradé attendu').toMatch(/noindex/);

    const f = await fiches(request, url);
    expect(parType(f, 'Article'), 'aucune fiche Article').toHaveLength(0);
    // L'organisation, elle, reste : c'est le layout qui la pose.
    expect(parType(f, 'Organization')).toHaveLength(1);
  });
});
