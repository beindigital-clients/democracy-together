import { v } from 'convex/values';
import type { MutationCtx, QueryCtx } from '../../_generated/server';
import type { Doc, Id } from '../../_generated/dataModel';
import { requireNetworkRole } from '../rbac';
import { recordAudit } from '../audit';
import type { AuditAction } from '../auditActions';
import { pickText, pickedLocale } from './i18n';
import type { SiteLocale } from '../locales';

// RANG DES CONTENUS ÉDITORIAUX : ÉDITEUR.
//
// Le back-office s'ouvre au modérateur, mais publier un événement, un
// partenaire ou une thématique engage la parole du réseau : c'est le rang qui
// tient déjà la revue et la newsletter. `requireNetworkRole` est hiérarchique,
// l'administrateur passe donc aussi. L'interface cache les écrans ; c'est
// cette garde, en tête de CHAQUE fonction, qui protège.
export async function requireEditor(ctx: QueryCtx | MutationCtx) {
  return await requireNetworkRole(ctx, 'editeur');
}

export type ContentKind = 'event' | 'replay' | 'partner' | 'press' | 'theme';

/** Une entrée de journal par geste éditorial (cf. `AUDIT.CONTENT_*`). */
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

// Forme publique d'un média référencé par un contenu : l'URL signée du
// stockage, le texte alternatif DANS LA LANGUE de la page (avec repli), et les
// dimensions — sans lesquelles l'image ferait sauter la mise en page.
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
