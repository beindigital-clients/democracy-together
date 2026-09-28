import { getCliClient } from 'sanity/cli';
import { homeFallback } from '../src/lib/home-content';

// Seed of the home page (F-10) via the authenticated CLI session:
//   npx sanity exec scripts/seed-home.ts --with-user-token
// Idempotent (createOrReplace on _ids `homePage-fr`/`-en`). Content taken from the
// LOCAL fallback (homeFallback) — nothing fabricated. Only arrays of OBJECTS
// receive a `_key` (arrays of strings do not need one).
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
