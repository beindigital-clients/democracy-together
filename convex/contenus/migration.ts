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

// IMPORT DU CONTENU CODÉ — commande interne, à lancer UNE fois par déploiement :
//
//   npx convex run contenus/migration:importCodedContent '{}'
//
// Elle recopie dans les tables EXACTEMENT ce que le dépôt servait : mêmes
// slugs, mêmes textes dans les cinq langues, même ordre. Source : les modules
// PURS `convex/lib/contenus/coded/*` — ceux-là mêmes que les pages publiques
// servent en repli, donc aucune divergence possible entre l'avant et l'après.
//
// IDEMPOTENTE : un contenu dont le slug existe déjà n'est PAS réécrit. La
// relancer ne crée aucun doublon — et surtout n'écrase pas ce qu'un éditeur a
// modifié entre-temps. Pour repartir du contenu codé sur une fiche, on la
// supprime (brouillon) puis on relance.
//
// Ce qui est importé, et dans quel état :
//  - 14 événements, PUBLIÉS (ils l'étaient), avec le fuseau de leur lieu ;
//  - 4 replays tirés des événements `upcoming: false` du catalogue (la page
//    /replays les dérivait ainsi), publiés, SANS vidéo — état honnête
//    « bientôt disponible » repris tel quel ;
//  - 5 catégories de partenariat, publiées, dans l'ordre du catalogue ;
//  - 5 thématiques (les axes du réseau), publiées, avec leur titre (repris de
//    `library.themes.*`) et leur synthèse.
// La revue de presse n'avait aucun contenu codé : rien à importer.

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
    // Les rediffusions du catalogue : un replay par événement passé.
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
    // Journalisée seulement si elle a écrit quelque chose : une relance à vide
    // n'a rien changé, elle n'a rien à tracer.
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
