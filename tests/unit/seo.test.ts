import { describe, it, expect } from 'vitest';
import {
  SITE_NAME,
  SITE_URL,
  ORGANIZATION_ID,
  openGraphLocale,
  alternateOpenGraphLocales,
  organizationJsonLd,
  jsonLdScript,
  isoDay,
  eventJsonLd,
  articleJsonLd,
} from '@/lib/seo';
import { eventToIcs } from '@/lib/ics';
import { routing } from '@/i18n/routing';

// F-03 — métadonnées de partage et données structurées.
//
// Mesuré avant correctif : zéro balise Open Graph, zéro Twitter Card, zéro
// JSON-LD sur les 48 pages publiques. Ce module porte ce que les pages n'ont
// pas à réécrire ; ce fichier tient ce qu'il promet.

describe('Étiquettes de langue Open Graph', () => {
  it('rend une étiquette TERRITORIALISÉE, pas un code court', () => {
    // `fr` n'est pas une valeur Open Graph valide : la spécification attend
    // langue_TERRITOIRE. Servir `fr` revient à ne rien servir.
    expect(openGraphLocale('fr')).toBe('fr_FR');
    expect(openGraphLocale('en')).toBe('en_US');
  });

  it('rend `undefined` pour une locale inconnue plutôt qu’une valeur inventée', () => {
    // On ne devine pas le territoire : `pt` pourrait être pt_PT ou pt_BR.
    expect(openGraphLocale('pt')).toBeUndefined();
    expect(openGraphLocale('')).toBeUndefined();
  });

  it('couvre TOUTES les locales servies par le site', () => {
    // Garde d'évolution : ajouter une locale à `routing` sans l'ajouter ici
    // la priverait silencieusement d'og:locale. Le test le dit.
    for (const l of routing.locales) {
      expect(
        openGraphLocale(l),
        `og:locale manquant pour « ${l} »`,
      ).toBeTruthy();
    }
  });
});

describe('Locales alternées', () => {
  it('annonce les AUTRES langues, jamais la sienne', () => {
    expect(alternateOpenGraphLocales('fr')).toEqual(['en_US']);
    expect(alternateOpenGraphLocales('en')).toEqual(['fr_FR']);
  });

  it('n’en compte jamais plus que le site n’a de langues', () => {
    expect(alternateOpenGraphLocales('fr')).toHaveLength(
      routing.locales.length - 1,
    );
  });

  it('écarte silencieusement une locale sans étiquette connue', () => {
    // Une locale inconnue ne doit pas produire un `undefined` dans le tableau,
    // ce qui donnerait `<meta property="og:locale:alternate" content="">`.
    for (const v of alternateOpenGraphLocales('fr')) {
      expect(typeof v).toBe('string');
      expect(v).not.toBe('');
    }
  });
});

describe('Données structurées — fiche Organization', () => {
  const fiche = organizationJsonLd('Une description du réseau.');

  it('porte le contexte et le type attendus par schema.org', () => {
    expect(fiche['@context']).toBe('https://schema.org');
    expect(fiche['@type']).toBe('Organization');
  });

  it('reprend le nom propre et l’URL du site', () => {
    expect(fiche.name).toBe(SITE_NAME);
    expect(fiche.url).toBe(SITE_URL);
  });

  it('reprend la description qu’on lui passe — donc traduite par l’appelant', () => {
    expect(fiche.description).toBe('Une description du réseau.');
    expect(organizationJsonLd('Another one.').description).toBe('Another one.');
  });

  it('pointe un logo en URL ABSOLUE', () => {
    // Un chemin relatif dans du JSON-LD n'est résolu par aucun moteur.
    expect(fiche.logo.startsWith('http')).toBe(true);
    expect(fiche.logo).toContain('/brand/');
  });

  it('ne déclare RIEN de plus que ce que le dépôt possède', () => {
    // Une adresse postale ou un profil social inventés seraient une donnée
    // fausse servie aux moteurs — pire que leur absence. La liste des clés
    // est donc close, et ce test est ce qui la tient fermée.
    expect(Object.keys(fiche).sort()).toEqual([
      '@context',
      '@id',
      '@type',
      'description',
      'logo',
      'name',
      'url',
    ]);
  });

  it('est sérialisable tel quel — c’est ainsi qu’il est posé dans le HTML', () => {
    expect(() => JSON.stringify(fiche)).not.toThrow();
    expect(JSON.parse(JSON.stringify(fiche))).toEqual(fiche);
  });
});

// --- P1 n° 4 du plan d'action : les fiches de PAGE ------------------------
//
// `Organization` répondait « qui publie » ; il restait à décrire CE QUI est
// publié. Deux constructeurs, et une règle unique qui les gouverne : une fiche
// ne déclare que ce que la page montre.

describe('Sérialisation d’un bloc JSON-LD', () => {
  // Un titre d'actualité est saisi dans le CMS : c'est du texte qu'on ne
  // contrôle pas. Celui-ci ferme la balise et ouvre une image piégée.
  const TITRE_PIEGE = `Fin</script><img src=x onerror=alert(1)>`;
  const fiche = { '@type': 'Article', headline: TITRE_PIEGE };

  it('JSON.stringify SEUL laisse sortir du bloc — le témoin', () => {
    // Sans ce test, rien ne dit que la protection sert à quelque chose.
    // Il échoue le jour où la menace disparaît ; en attendant, il la montre.
    expect(JSON.stringify(fiche)).toContain('</scr' + 'ipt');
  });

  it('n’émet JAMAIS la séquence qui fermerait la balise', () => {
    expect(jsonLdScript(fiche)).not.toContain('</scr' + 'ipt');
    expect(jsonLdScript(fiche)).not.toContain('<');
  });

  it('reste du JSON valide — le moteur reçoit la donnée intacte', () => {
    // `\u003c` est un échappement légal : l'aller-retour doit rendre le `<`.
    expect(JSON.parse(jsonLdScript(fiche))).toEqual(fiche);
    expect(JSON.parse(jsonLdScript(fiche)).headline).toBe(TITRE_PIEGE);
  });

  it('n’abîme ni les accents ni les guillemets', () => {
    const v = { a: 'Événement « clé »', b: 'il a dit "oui"' };
    expect(JSON.parse(jsonLdScript(v))).toEqual(v);
  });
});

describe('Date d’un jour entier', () => {
  it('zéro-padde le mois et le jour', () => {
    expect(isoDay({ y: 2026, mo: 9, d: 3 })).toBe('2026-09-03');
    expect(isoDay({ y: 2026, mo: 11, d: 14 })).toBe('2026-11-14');
  });
});

describe('Données structurées — fiche Event', () => {
  const base = {
    name: 'Conférence inaugurale',
    slug: 'conference-inaugurale',
    locale: 'fr',
    description: 'Une journée pour fonder publiquement le réseau.',
    start: { y: 2026, mo: 11, d: 14 },
    placeName: 'Paris',
    inLanguage: ['fr', 'en'],
  };
  const fiche = eventJsonLd({ ...base, format: 'hybride' as const });

  it('porte le contexte et le type attendus par schema.org', () => {
    expect(fiche['@context']).toBe('https://schema.org');
    expect(fiche['@type']).toBe('Event');
  });

  it('pointe l’adresse ABSOLUE de la page de l’événement', () => {
    expect(fiche.url).toBe(`${SITE_URL}/fr/evenements/conference-inaugurale`);
  });

  it('commence ET finit le même jour — `endDate` de schema.org est INCLUSIVE', () => {
    expect(fiche.startDate).toBe('2026-11-14');
    expect(fiche.endDate).toBe('2026-11-14');
  });

  it('ne recopie PAS la fin de l’iCalendar, qui désigne le lendemain', () => {
    // Le piège est réel : les deux formats décrivent le même jour entier avec
    // des conventions opposées. Ce test tient les deux côtés à la fois, pour
    // qu’aligner l’un sur l’autre fasse rougir plutôt que dériver en silence.
    const ics = eventToIcs({
      uid: 'x@democracy-together.org',
      start: base.start,
      title: base.name,
    });
    expect(ics).toContain('DTEND;VALUE=DATE:20261115');
    expect(fiche.endDate).toBe('2026-11-14');
  });

  it('traduit le format du dépôt en mode de participation schema.org', () => {
    expect(
      eventJsonLd({ ...base, format: 'presentiel' }).eventAttendanceMode,
    ).toBe('https://schema.org/OfflineEventAttendanceMode');
    expect(
      eventJsonLd({ ...base, format: 'en-ligne' }).eventAttendanceMode,
    ).toBe('https://schema.org/OnlineEventAttendanceMode');
    expect(fiche.eventAttendanceMode).toBe(
      'https://schema.org/MixedEventAttendanceMode',
    );
  });

  it('déclare un LIEU pour le présentiel, une adresse en ligne pour le distanciel', () => {
    const presentiel = eventJsonLd({ ...base, format: 'presentiel' }).location;
    expect(presentiel).toEqual({
      '@type': 'Place',
      name: 'Paris',
      address: { '@type': 'PostalAddress', addressLocality: 'Paris' },
    });

    // Un webinaire a `cityKey: 'online'` : son libellé (« En ligne ») n’est pas
    // une ville, et le servir comme `Place` serait une adresse inventée.
    const enLigne = eventJsonLd({
      ...base,
      format: 'en-ligne',
      placeName: 'En ligne',
    }).location;
    expect(enLigne).toEqual({ '@type': 'VirtualLocation', url: fiche.url });
  });

  it('déclare les DEUX lieux pour un événement hybride', () => {
    expect(Array.isArray(fiche.location)).toBe(true);
    expect(
      (fiche.location as unknown[]).map(
        (l) => (l as { '@type': string })['@type'],
      ),
    ).toEqual(['Place', 'VirtualLocation']);
  });

  it('RÉFÉRENCE l’organisation du layout au lieu de la recopier', () => {
    expect(fiche.organizer).toEqual({ '@id': ORGANIZATION_ID });
    // Le renvoi ne vaut que si la fiche visée porte bien cet identifiant.
    expect(organizationJsonLd('peu importe')['@id']).toBe(ORGANIZATION_ID);
  });

  it('omet les langues plutôt que d’émettre un tableau vide', () => {
    expect(
      eventJsonLd({ ...base, format: 'presentiel', inLanguage: [] }),
    ).not.toHaveProperty('inLanguage');
    expect(fiche.inLanguage).toEqual(['fr', 'en']);
  });

  it('ne déclare NI image, NI tarif, NI intervenant', () => {
    // La page sert la même photo de Paris pour Dakar, ses tarifs sont fictifs
    // et ses intervenants relèvent du même jeu d’illustration. La liste est
    // close, et ce test est ce qui la tient fermée.
    expect(Object.keys(fiche).sort()).toEqual([
      '@context',
      '@type',
      'description',
      'endDate',
      'eventAttendanceMode',
      'eventStatus',
      'inLanguage',
      'location',
      'name',
      'organizer',
      'startDate',
      'url',
    ]);
  });

  it('est sérialisable tel quel — c’est ainsi qu’il est posé dans le HTML', () => {
    expect(JSON.parse(jsonLdScript(fiche))).toEqual(fiche);
  });
});

describe('Données structurées — fiche Article', () => {
  const fiche = articleJsonLd({
    headline: 'Le réseau se dote d’une charte',
    slug: 'charte-du-reseau',
    locale: 'fr',
    description: 'Un chapô.',
    datePublished: '2026-09-17T08:30:00.000Z',
    inLanguage: 'fr',
  });

  it('porte le contexte et le type attendus par schema.org', () => {
    expect(fiche['@context']).toBe('https://schema.org');
    expect(fiche['@type']).toBe('Article');
  });

  it('désigne SA PROPRE page comme entité principale', () => {
    const url = `${SITE_URL}/fr/actualites/charte-du-reseau`;
    expect(fiche.url).toBe(url);
    expect(fiche.mainEntityOfPage).toEqual({ '@type': 'WebPage', '@id': url });
  });

  it('reprend la date de publication telle que le CMS la sert', () => {
    expect(fiche.datePublished).toBe('2026-09-17T08:30:00.000Z');
  });

  it('RÉFÉRENCE l’organisation comme éditeur', () => {
    expect(fiche.publisher).toEqual({ '@id': ORGANIZATION_ID });
  });

  it('omet le chapô absent plutôt que d’émettre une description vide', () => {
    // `excerpt` est facultatif dans le schéma Sanity.
    const sansChapo = articleJsonLd({
      headline: 'T',
      slug: 's',
      locale: 'fr',
      datePublished: '2026-01-01T00:00:00.000Z',
    });
    expect(sansChapo).not.toHaveProperty('description');
  });

  it('ne déclare NI auteur, NI image', () => {
    // Le schéma Sanity n’a pas de champ auteur : en inventer un serait une
    // donnée fausse. `coverUrl` est bien projeté par la requête, mais la page
    // ne le rend pas — une fiche décrit la page, pas la requête.
    expect(Object.keys(fiche).sort()).toEqual([
      '@context',
      '@type',
      'datePublished',
      'description',
      'headline',
      'inLanguage',
      'mainEntityOfPage',
      'publisher',
      'url',
    ]);
  });

  it('survit à un titre qui tente de sortir du bloc', () => {
    const piege = articleJsonLd({
      headline: `Fin</script><img src=x onerror=alert(1)>`,
      slug: 's',
      locale: 'fr',
      datePublished: '2026-01-01T00:00:00.000Z',
    });
    expect(jsonLdScript(piege)).not.toContain('<');
    expect(JSON.parse(jsonLdScript(piege)).headline).toBe(piege.headline);
  });
});
