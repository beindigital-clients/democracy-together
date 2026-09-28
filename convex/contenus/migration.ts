import { v } from 'convex/values';
import { internalMutation, type MutationCtx } from '../_generated/server';
import { AUDIT } from '../lib/auditActions';
import { recordAudit } from '../lib/audit';
import { SITE_LOCALES } from '../lib/locales';
import type { LocalizedList, LocalizedText } from '../lib/contenus/i18n';
import { isoDate, scheduleInstants } from '../lib/contenus/time';
import {
  CODED_CITY_TIMEZONES,
  CODED_EVENTS,
  CODED_EVENT_CITIES,
  CODED_EVENT_TITLES,
  CODED_FEATURED_SLUG,
} from '../lib/contenus/coded/events';
import { CODED_PARTNERS, PARTNER_SLUGS } from '../lib/contenus/coded/partners';
import {
  CODED_THEMES,
  CODED_THEME_TITLES,
  THEME_SLUGS,
} from '../lib/contenus/coded/themes';

// IMPORT OF HARD-CODED CONTENT — internal command, to run ONCE per deployment:
//
//   npx convex run contenus/migration:importCodedContent '{}'
//
// It copies into the tables EXACTLY what the repo served: same
// slugs, same texts in the five languages, same order. Source: the PURE
// modules `convex/lib/contenus/coded/*` — the very ones the public pages
// serve as a fallback, so no divergence is possible between before and after.
//
// IDEMPOTENT: content whose slug already exists is NOT rewritten.
// Rerunning it creates no duplicate — and above all does not overwrite what an editor
// modified in the meantime. To start again from the hard-coded content for a record, you
// delete it (draft) then rerun.
//
// What is imported, and in what state:
//  - 14 events, PUBLISHED (they were), with their venue's time zone;
//  - 4 replays drawn from the catalog's `upcoming: false` events (the
//    /replays page derived them that way), published, WITHOUT video — the honest
//    "coming soon" state carried over as-is;
//  - 5 partnership categories, published, in catalog order;
//  - 5 themes (the network's axes), published, with their title (taken from
//    `library.themes.*`) and their summary.
// The press review had no hard-coded content: nothing to import.

function fromLocales(
  pick: (loc: (typeof SITE_LOCALES)[number]) => string | undefined,
): LocalizedText {
  const out: LocalizedText = {};
  for (const l of SITE_LOCALES) {
    const value = pick(l);
    if (value) out[l] = value;
  }
  return out;
}

function listFromLocales(
  pick: (loc: (typeof SITE_LOCALES)[number]) => string[] | undefined,
): LocalizedList {
  const out: LocalizedList = {};
  for (const l of SITE_LOCALES) {
    const value = pick(l);
    if (value && value.length) out[l] = [...value];
  }
  return out;
}

async function importEvents(ctx: MutationCtx, now: number) {
  let created = 0;
  let replays = 0;
  for (const e of CODED_EVENTS) {
    const startDate = isoDate(e.y, e.mo, e.d);
    const timezone = CODED_CITY_TIMEZONES[e.cityKey] ?? 'Europe/Paris';
    let eventId = (
      await ctx.db
        .query('contentEvents')
        .withIndex('by_slug', (q) => q.eq('slug', e.slug))
        .unique()
    )?._id;
    if (!eventId) {
      const { startsAt, endsAt } = scheduleInstants({ startDate, timezone });
      eventId = await ctx.db.insert('contentEvents', {
        slug: e.slug,
        type: e.type,
        region: e.region,
        format: e.format,
        theme: e.theme,
        langs: [...e.langs],
        title: fromLocales((l) => CODED_EVENT_TITLES[l][e.slug]),
        place: fromLocales((l) => CODED_EVENT_CITIES[l][e.cityKey]),
        cityKey: e.cityKey,
        startDate,
        timezone,
        startsAt,
        endsAt,
        status: 'published',
        featured: e.slug === CODED_FEATURED_SLUG,
        durationMin: e.durationMin,
        updatedAt: now,
      });
      created += 1;
    }
    // The catalog's rebroadcasts: one replay per past event.
    if (!e.upcoming) {
      const existing = await ctx.db
        .query('contentReplays')
        .withIndex('by_slug', (q) => q.eq('slug', e.slug))
        .unique();
      if (!existing) {
        await ctx.db.insert('contentReplays', {
          slug: e.slug,
          title: fromLocales((l) => CODED_EVENT_TITLES[l][e.slug]),
          eventId,
          eventSlug: e.slug,
          eventType: e.type,
          themes: [e.theme],
          langs: [...e.langs],
          recordedOn: startDate,
          durationMin: e.durationMin,
          status: 'published',
          updatedAt: now,
        });
        replays += 1;
      }
    }
  }
  return { events: created, replays };
}

async function importPartners(ctx: MutationCtx, now: number) {
  let created = 0;
  for (const [i, slug] of PARTNER_SLUGS.entries()) {
    const existing = await ctx.db
      .query('contentPartners')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (existing) continue;
    await ctx.db.insert('contentPartners', {
      slug,
      name: fromLocales((l) => CODED_PARTNERS[l][slug].title),
      kicker: fromLocales((l) => CODED_PARTNERS[l][slug].kicker),
      summary: fromLocales((l) => CODED_PARTNERS[l][slug].summary),
      gives: fromLocales((l) => CODED_PARTNERS[l][slug].gives),
      gets: fromLocales((l) => CODED_PARTNERS[l][slug].gets),
      order: i + 1,
      status: 'published',
      updatedAt: now,
    });
    created += 1;
  }
  return created;
}

async function importThemes(ctx: MutationCtx, now: number) {
  let created = 0;
  for (const [i, slug] of THEME_SLUGS.entries()) {
    const existing = await ctx.db
      .query('contentThemes')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (existing) continue;
    await ctx.db.insert('contentThemes', {
      slug,
      title: fromLocales((l) => CODED_THEME_TITLES[l][slug]),
      lead: fromLocales((l) => CODED_THEMES[l][slug].lead),
      stance: listFromLocales((l) => CODED_THEMES[l][slug].stance),
      questions: listFromLocales((l) => CODED_THEMES[l][slug].questions),
      dimension: CODED_THEMES.fr[slug].dimension,
      order: i + 1,
      status: 'published',
      updatedAt: now,
    });
    created += 1;
  }
  return created;
}

export const importCodedContent = internalMutation({
  args: {},
  returns: v.object({
    events: v.number(),
    replays: v.number(),
    partners: v.number(),
    themes: v.number(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const { events, replays } = await importEvents(ctx, now);
    const partners = await importPartners(ctx, now);
    const themes = await importThemes(ctx, now);
    const result = { events, replays, partners, themes };
    // Logged only if it wrote something: a no-op rerun
    // changed nothing, it has nothing to record.
    if (events + replays + partners + themes > 0) {
      await recordAudit(ctx, {
        action: AUDIT.CONTENT_IMPORTED,
        targetId: 'coded-content',
        metadata: result,
      });
    }
    return result;
  },
});
