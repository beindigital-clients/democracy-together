import { getCliClient } from 'sanity/cli';
import { aboutFallback } from '../src/lib/about-content';

// Seed de la page À propos (F-11/F-12) via la session CLI authentifiée :
//   npx sanity exec scripts/seed-about.ts --with-user-token
// Idempotent (createOrReplace sur _id déterministes `aboutPage-fr`/`-en`).
// Le contenu provient du repli LOCAL (aboutFallback) — aucune fabrication. Les
// tableaux Sanity exigent un `_key` par élément, ajouté ici.
const client = getCliClient();

type Obj = Record<string, unknown>;
const keyed = <T extends Obj>(arr: T[]): (T & { _key: string })[] =>
  arr.map((x, i) => ({ _key: `k${i}`, ...x }));

const LOCALES = ['fr', 'en'] as const;

async function run() {
  for (const locale of LOCALES) {
    const c = aboutFallback(locale);
    await client.createOrReplace({
      _id: `aboutPage-${locale}`,
      _type: 'aboutPage',
      language: locale,
      hero: c.hero,
      vision: c.vision,
      mission: { eyebrow: c.mission.eyebrow, axes: keyed(c.mission.axes) },
      founders: {
        eyebrow: c.founders.eyebrow,
        title: c.founders.title,
        intro: c.founders.intro,
        people: keyed(c.founders.people),
      },
      governance: {
        eyebrow: c.governance.eyebrow,
        title: c.governance.title,
        intro: c.governance.intro,
        hubs: keyed(c.governance.hubs),
        framework: c.governance.framework,
        committees: {
          title: c.governance.committees.title,
          items: keyed(c.governance.committees.items),
        },
      },
      funding: {
        eyebrow: c.funding.eyebrow,
        title: c.funding.title,
        intro: c.funding.intro,
        sources: keyed(c.funding.sources),
        note: c.funding.note,
      },
      lineage: {
        eyebrow: c.lineage.eyebrow,
        title: c.lineage.title,
        intro: c.lineage.intro,
        refs: keyed(c.lineage.refs),
      },
      timeline: {
        eyebrow: c.timeline.eyebrow,
        title: c.timeline.title,
        intro: c.timeline.intro,
        steps: keyed(c.timeline.steps),
      },
      cta: c.cta,
    });
    console.log('seeded aboutPage', locale);
  }
  console.log(`\nDone: ${LOCALES.length} aboutPage documents.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
