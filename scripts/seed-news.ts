import { getCliClient } from 'sanity/cli';

// Seed des actualités (F-15) via la session CLI authentifiée :
//   npx sanity exec scripts/seed-news.ts --with-user-token
// Idempotent (createOrReplace sur des _id déterministes). Contenu de
// démonstration aligné sur la feuille de route publique du réseau.
const client = getCliClient();

type Draft = {
  id: string;
  language: 'fr' | 'en';
  title: string;
  slug: string;
  excerpt: string;
  publishedAt: string;
  paragraphs: string[];
};

const DRAFTS: Draft[] = [
  {
    id: 'news-fr-collectif',
    language: 'fr',
    title: 'Le collectif fondateur de Democracy Together est réuni',
    slug: 'collectif-fondateur',
    excerpt:
      "Scientifiques, diplomates et entrepreneurs posent les bases d'un réseau de think tanks entre l'Afrique et l'Europe.",
    publishedAt: '2026-06-20T09:00:00.000Z',
    paragraphs: [
      "Democracy Together franchit une première étape : son collectif fondateur s'est réuni autour d'une conviction commune, relier les think tanks qui travaillent sur la démocratie de part et d'autre de la Méditerranée.",
      'Les fondateurs ont arrêté les quatre axes de la mission — agréger les analyses, promouvoir les idées, renforcer les capacités, innover et inclure — et engagé la rédaction des statuts de la future association loi 1901.',
    ],
  },
  {
    id: 'news-fr-conference',
    language: 'fr',
    title: 'Cap sur la conférence inaugurale à Paris',
    slug: 'conference-inaugurale-paris',
    excerpt:
      'Le réseau prépare son lancement public et sa première conférence, prévus en 2026.',
    publishedAt: '2026-06-12T09:00:00.000Z',
    paragraphs: [
      'La conférence inaugurale de Democracy Together réunira à Paris chercheurs, décideurs et partenaires pour présenter le réseau, ses premiers travaux et sa feuille de route Afrique-Europe.',
      'Cet événement marquera l’ouverture des adhésions et l’amorce des relais régionaux de Dakar et de Bruxelles.',
    ],
  },
  {
    id: 'news-fr-afrique-europe',
    language: 'fr',
    title: "Relier l'Afrique et l'Europe autour de la démocratie",
    slug: 'afrique-europe-democratie',
    excerpt:
      'Pourquoi un réseau transcontinental de think tanks, et ce qu’il veut changer.',
    publishedAt: '2026-06-05T09:00:00.000Z',
    paragraphs: [
      "Les analyses sur l'état de la démocratie restent souvent cloisonnées par pays ou par continent. Democracy Together veut les rassembler en un corpus commun, comparable et citable.",
      'En reliant des institutions du Sénégal à la Belgique, le réseau entend faire circuler les idées et porter une voix commune auprès des décideurs et des médias.',
    ],
  },
  {
    id: 'news-en-collective',
    language: 'en',
    title: 'Democracy Together’s founding collective convenes',
    slug: 'founding-collective',
    excerpt:
      'Scientists, diplomats and entrepreneurs lay the foundations of a think-tank network between Africa and Europe.',
    publishedAt: '2026-06-20T09:00:00.000Z',
    paragraphs: [
      'Democracy Together reaches a first milestone: its founding collective has convened around a shared conviction, to connect the think tanks working on democracy on both sides of the Mediterranean.',
      'The founders settled the four pillars of the mission — aggregate analyses, promote ideas, strengthen capacity, innovate and include — and began drafting the statutes of the future non-profit association.',
    ],
  },
  {
    id: 'news-en-conference',
    language: 'en',
    title: 'Heading towards the inaugural conference in Paris',
    slug: 'inaugural-conference-paris',
    excerpt:
      'The network is preparing its public launch and first conference, planned for 2026.',
    publishedAt: '2026-06-12T09:00:00.000Z',
    paragraphs: [
      'Democracy Together’s inaugural conference will bring together researchers, decision-makers and partners in Paris to present the network, its first work and its Africa–Europe roadmap.',
      'The event will mark the opening of memberships and the start of the Dakar and Brussels regional relays.',
    ],
  },
  {
    id: 'news-en-africa-europe',
    language: 'en',
    title: 'Connecting Africa and Europe around democracy',
    slug: 'africa-europe-democracy',
    excerpt:
      'Why a transcontinental think-tank network, and what it aims to change.',
    publishedAt: '2026-06-05T09:00:00.000Z',
    paragraphs: [
      'Analyses on the state of democracy too often stay siloed by country or by continent. Democracy Together wants to bring them together into a shared, comparable and citable corpus.',
      'By connecting institutions from Senegal to Belgium, the network intends to circulate ideas and carry a shared voice to decision-makers and the media.',
    ],
  },
];

function toBlocks(paragraphs: string[]) {
  return paragraphs.map((text, i) => ({
    _type: 'block',
    _key: `b${i}`,
    style: 'normal',
    markDefs: [],
    children: [{ _type: 'span', _key: `s${i}`, text, marks: [] }],
  }));
}

async function run() {
  for (const d of DRAFTS) {
    await client.createOrReplace({
      _id: d.id,
      _type: 'post',
      title: d.title,
      slug: { _type: 'slug', current: d.slug },
      language: d.language,
      excerpt: d.excerpt,
      publishedAt: d.publishedAt,
      body: toBlocks(d.paragraphs),
    });
    console.log('seeded', d.id, `(${d.language})`);
  }
  console.log(`\nDone: ${DRAFTS.length} posts.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
