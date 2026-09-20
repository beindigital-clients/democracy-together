import { internalMutation } from './_generated/server';
import { trackOrganizationStatus } from './lib/counters';

// DEV/TEST UNIQUEMENT (garde AUTH_DEV_OTP) : peuple l'annuaire (F-19) avec un
// jeu de think tanks de démonstration, réparti sur les régions Afrique–Europe
// et les thématiques du réseau. Idempotent (ignore un slug déjà présent), donc
// rejouable. Données illustratives : noms/sites fictifs, aucune affirmation sur
// des organisations réelles.
const ORGS = [
  {
    name: 'Institut Sahel pour la Gouvernance',
    slug: 'institut-sahel-gouvernance',
    country: 'SN',
    region: 'afrique-ouest',
    languages: ['fr'],
    themes: ['gouvernance', 'elections', 'jeunesse'],
    description:
      "Centre d'analyse sénégalais consacré à la gouvernance démocratique et à l'intégrité électorale au Sahel, avec un fort volet de formation des jeunes chercheurs.",
    websiteUrl: 'https://institut-sahel.org',
  },
  {
    name: "Centre Ouest-Africain d'Analyse Démocratique",
    slug: 'centre-ouest-africain-analyse-democratique',
    country: 'CI',
    region: 'afrique-ouest',
    languages: ['fr', 'en'],
    themes: ['elections', 'medias', 'droits'],
    description:
      "Think tank ivoirien qui suit les processus électoraux et la liberté des médias en Afrique de l'Ouest francophone.",
    websiteUrl: 'https://coaad.org',
  },
  {
    name: 'Accra Governance Lab',
    slug: 'accra-governance-lab',
    country: 'GH',
    region: 'afrique-ouest',
    languages: ['en'],
    themes: ['gouvernance', 'numerique', 'jeunesse'],
    description:
      "Laboratoire ghanéen explorant l'usage des outils numériques pour la transparence publique et la participation citoyenne.",
    websiteUrl: 'https://accragovlab.org',
  },
  {
    name: 'Observatoire des Grands Lacs',
    slug: 'observatoire-grands-lacs',
    country: 'CD',
    region: 'afrique-centrale',
    languages: ['fr'],
    themes: ['paix', 'droits', 'gouvernance'],
    description:
      'Observatoire indépendant des dynamiques de paix, de droits humains et de gouvernance dans la région des Grands Lacs.',
    websiteUrl: 'https://observatoire-grandslacs.org',
  },
  {
    name: 'Nairobi Institute for Democratic Futures',
    slug: 'nairobi-democratic-futures',
    country: 'KE',
    region: 'afrique-est',
    languages: ['en', 'sw'],
    themes: ['numerique', 'medias', 'jeunesse'],
    description:
      "Institut kényan d'analyse prospective sur la démocratie numérique, la désinformation et l'engagement de la jeunesse.",
    websiteUrl: 'https://nairobidemocracy.org',
  },
  {
    name: 'Maghreb Policy Forum',
    slug: 'maghreb-policy-forum',
    country: 'TN',
    region: 'afrique-nord',
    languages: ['ar', 'fr'],
    themes: ['gouvernance', 'droits', 'economie'],
    description:
      'Forum de politiques publiques tunisien dédié à la gouvernance, aux droits et à la transition économique au Maghreb.',
    websiteUrl: 'https://maghrebpolicyforum.org',
  },
  {
    name: 'Cape Town Democracy Initiative',
    slug: 'cape-town-democracy-initiative',
    country: 'ZA',
    region: 'afrique-australe',
    languages: ['en'],
    themes: ['genre', 'droits', 'climat'],
    description:
      'Initiative sud-africaine travaillant sur l’inclusion, le genre et la justice climatique au service des institutions démocratiques.',
    websiteUrl: 'https://capetowndemocracy.org',
  },
  {
    name: 'Institut Européen pour la Démocratie',
    slug: 'institut-europeen-democratie',
    country: 'FR',
    region: 'europe-ouest',
    languages: ['fr', 'en'],
    themes: ['gouvernance', 'medias', 'economie'],
    description:
      'Institut français de recherche sur les institutions démocratiques, le rôle des médias et la gouvernance économique en Europe.',
    websiteUrl: 'https://institut-democratie.eu',
  },
  {
    name: 'Brussels Forum for Open Societies',
    slug: 'brussels-open-societies',
    country: 'BE',
    region: 'europe-ouest',
    languages: ['fr', 'en'],
    themes: ['droits', 'numerique', 'paix'],
    description:
      'Forum belge réunissant chercheurs et décideurs autour des libertés, du numérique et de la sécurité démocratique.',
    websiteUrl: 'https://brusselsopensocieties.eu',
  },
  {
    name: 'Lisbon Atlantic Council for Democracy',
    slug: 'lisbon-atlantic-democracy',
    country: 'PT',
    region: 'europe-ouest',
    languages: ['pt', 'en'],
    themes: ['economie', 'climat', 'paix'],
    description:
      'Cercle de réflexion portugais sur les liens atlantiques, la résilience démocratique et les enjeux climatiques.',
    websiteUrl: 'https://lisbonatlantic.org',
  },
] as const;

// internalMutation : NON joignable depuis un client (défense en profondeur —
// même si AUTH_DEV_OTP fuyait en prod, cette écriture resterait inaccessible de
// l'extérieur). Invoquée en E2E via `npx convex run seed:seedDirectory` (CLI,
// contexte de confiance) comme les fonctions devAdmin. La garde env reste en
// seconde ligne.
export const seedDirectory = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.AUTH_DEV_OTP !== 'true') {
      throw new Error('Désactivé (AUTH_DEV_OTP).');
    }
    let inserted = 0;
    for (const org of ORGS) {
      const existing = await ctx.db
        .query('organizations')
        .withIndex('by_slug', (q) => q.eq('slug', org.slug))
        .unique();
      if (existing) continue;
      await ctx.db.insert('organizations', {
        ...org,
        languages: [...org.languages],
        themes: [...org.themes],
        status: 'active',
        createdAt: Date.now(),
      });
      await trackOrganizationStatus(ctx, null, 'active');
      inserted += 1;
    }
    return { inserted, total: ORGS.length };
  },
});
