import { getCliClient } from 'sanity/cli';
import { homeFallback } from '../src/lib/home-content';

// Seed de la page d'accueil (F-10) via la session CLI authentifiée :
//   npx sanity exec scripts/seed-home.ts --with-user-token
// Idempotent (createOrReplace sur _id `homePage-fr`/`-en`). Contenu issu du
// repli LOCAL (homeFallback) — aucune fabrication. Seuls les tableaux d'OBJETS
// reçoivent un `_key` (les tableaux de chaînes n'en ont pas besoin).
const client = getCliClient();

type Obj = Record<string, unknown>;
const keyed = <T extends Obj>(arr: T[]): (T & { _key: string })[] =>
  arr.map((x, i) => ({ _key: `k${i}`, ...x }));

const LOCALES = ['fr', 'en'] as const;

async function run() {
  for (const locale of LOCALES) {
    const c = homeFallback(locale);
    await client.createOrReplace({
      _id: `homePage-${locale}`,
      _type: 'homePage',
      language: locale,
      hero: { ...c.hero, creds: keyed(c.hero.creds) },
      mission: { ...c.mission, cells: keyed(c.mission.cells) },
      analyses: { ...c.analyses, items: keyed(c.analyses.items) },
      barometre: { ...c.barometre, countries: keyed(c.barometre.countries) },
      axes: { ...c.axes, items: keyed(c.axes.items) },
      events: { ...c.events, items: keyed(c.events.items) },
      youth: { ...c.youth, steps: keyed(c.youth.steps) },
      join: { ...c.join, plans: keyed(c.join.plans) },
      newsletter: c.newsletter,
    });
    console.log('seeded homePage', locale);
  }
  console.log(`\nDone: ${LOCALES.length} homePage documents.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
