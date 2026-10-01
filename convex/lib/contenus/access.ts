import { v } from 'convex/values';
import type { MutationCtx, QueryCtx } from '../../_generated/server';
import type { Doc, Id } from '../../_generated/dataModel';
import { requireNetworkRole } from '../rbac';
import { recordAudit } from '../audit';
import type { AuditAction } from '../auditActions';
import { pickText, pickedLocale } from './i18n';
import type { SiteLocale } from '../locales';

// RANK FOR EDITORIAL CONTENT: EDITOR.
//
// The back office opens to moderators, but publishing an event, a
// partner or a theme commits the network's voice: it is the rank that
// already runs the journal and the newsletter. `requireNetworkRole` is hierarchical,
// so administrators pass too. The interface hides the screens; it is
// this guard, at the top of EACH function, that protects.
export async function requireEditor(ctx: QueryCtx | MutationCtx) {
  return await requireNetworkRole(ctx, 'editeur');
}

export type ContentKind =
  'event' | 'replay' | 'partner' | 'press' | 'theme' | 'news';

/** One log entry per editorial action (cf. `AUDIT.CONTENT_*`). */
export async function auditContent(
  ctx: MutationCtx,
  actorId: Id<'users'>,
  action: AuditAction,
  kind: ContentKind | 'media',
  targetId: string,
  metadata: Record<string, unknown> = {},
) {
  await recordAudit(ctx, {
    actorId,
    action,
    targetId,
    metadata: { kind, ...metadata },
  });
}

// Public shape of a medium referenced by a content item: the signed storage
// URL, the alternative text IN THE LANGUAGE of the page (with fallback), and the
// dimensions — without which the image would make the layout jump.
export const publicMediaValidator = v.object({
  url: v.string(),
  alt: v.string(),
  altLang: v.string(),
  width: v.union(v.number(), v.null()),
  height: v.union(v.number(), v.null()),
});

export async function publicMedia(
  ctx: QueryCtx,
  mediaId: Id<'contentMedia'> | undefined,
  locale: SiteLocale,
) {
  if (!mediaId) return null;
  const media: Doc<'contentMedia'> | null = await ctx.db.get(mediaId);
  if (!media || media.kind !== 'image') return null;
  const url = await ctx.storage.getUrl(media.storageId);
  if (!url) return null;
  return {
    url,
    alt: pickText(media.alt, locale),
    altLang: pickedLocale(media.alt, locale),
    width: media.width ?? null,
    height: media.height ?? null,
  };
}
