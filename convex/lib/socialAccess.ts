import { v } from 'convex/values';
import type { QueryCtx, MutationCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import { roleRank } from './roles';
// Un compte suspendu (chantier comptes) est lu comme un visiteur.
import { getActiveUserId } from './rbac';
import { canViewProfile, isNotificationPrefType } from './social';

// Lectures partagées du chantier « social » : qui regarde, qui a bloqué qui,
// qui suit qui. Toute décision d'accès passe par les fonctions PURES de
// `./social` — ce module ne fait que rassembler les faits qu'elles jugent.

type Ctx = QueryCtx | MutationCtx;

export type Viewer = {
  userId: Id<'users'>;
  user: Doc<'users'>;
  isMember: boolean;
} | null;

export function isMemberRole(role: string | null | undefined): boolean {
  return roleRank(role) >= roleRank('membre');
}

export async function loadViewer(ctx: Ctx): Promise<Viewer> {
  const userId = await getActiveUserId(ctx);
  if (!userId) return null;
  const user = await ctx.db.get(userId);
  if (!user) return null;
  return { userId, user, isMember: isMemberRole(user.role) };
}

// Garde des écritures sociales : un membre VALIDÉ du réseau. Les visiteurs
// auto-inscrits peuvent tenir leur profil et leurs préférences, pas écrire à
// autrui ni suivre quelqu'un.
export async function requireSocialMember(ctx: Ctx) {
  const viewer = await loadViewer(ctx);
  if (!viewer) throw new Error('UNAUTHENTICATED');
  if (!viewer.isMember) throw new Error('FORBIDDEN');
  return viewer;
}

export async function profileByUserId(
  ctx: Ctx,
  userId: Id<'users'>,
): Promise<Doc<'memberProfiles'> | null> {
  return await ctx.db
    .query('memberProfiles')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .unique();
}

export async function profileByHandle(
  ctx: Ctx,
  handle: string,
): Promise<Doc<'memberProfiles'> | null> {
  return await ctx.db
    .query('memberProfiles')
    .withIndex('by_handle', (q) => q.eq('handle', handle))
    .unique();
}

export async function isBlocked(
  ctx: Ctx,
  blockerId: Id<'users'>,
  blockedId: Id<'users'>,
): Promise<boolean> {
  const row = await ctx.db
    .query('blocks')
    .withIndex('by_blocker_and_blocked', (q) =>
      q.eq('blockerId', blockerId).eq('blockedId', blockedId),
    )
    .unique();
  return row !== null;
}

export async function isBlockedEitherWay(
  ctx: Ctx,
  a: Id<'users'>,
  b: Id<'users'>,
): Promise<boolean> {
  return (await isBlocked(ctx, a, b)) || (await isBlocked(ctx, b, a));
}

export async function isFollowing(
  ctx: Ctx,
  followerId: Id<'users'>,
  followeeId: Id<'users'>,
): Promise<boolean> {
  const row = await ctx.db
    .query('follows')
    .withIndex('by_follower_and_followee', (q) =>
      q.eq('followerId', followerId).eq('followeeId', followeeId),
    )
    .unique();
  return row !== null;
}

export async function userIsMember(
  ctx: Ctx,
  userId: Id<'users'>,
): Promise<boolean> {
  const user = await ctx.db.get(userId);
  return user ? isMemberRole(user.role) : false;
}

// Le profil est-il visible de ce lecteur ? Rassemble les faits (rôle du
// propriétaire, blocage) et laisse `canViewProfile` trancher.
export async function viewerCanSee(
  ctx: Ctx,
  viewer: Viewer,
  profile: Doc<'memberProfiles'>,
): Promise<boolean> {
  const isSelf = viewer?.userId === profile.userId;
  if (isSelf) return true;
  const ownerIsMember = await userIsMember(ctx, profile.userId);
  const blockedByOwner = viewer
    ? await isBlocked(ctx, profile.userId, viewer.userId)
    : false;
  return canViewProfile({
    visibility: profile.visibility,
    isSelf,
    ownerIsMember,
    viewerIsMember: viewer?.isMember ?? false,
    blockedByOwner,
  });
}

export async function photoUrl(
  ctx: Ctx,
  profile: Pick<Doc<'memberProfiles'>, 'photoId'>,
): Promise<string | null> {
  return profile.photoId ? await ctx.storage.getUrl(profile.photoId) : null;
}

// Organisation affichée sur un profil : LUE depuis le rattachement existant
// (`organizationMemberships`), jamais saisie par la personne — sinon chacun
// pourrait se déclarer d'une organisation du réseau. Seule une fiche ACTIVE
// est montrée, comme dans l'annuaire.
export async function displayedOrganization(
  ctx: Ctx,
  userId: Id<'users'>,
): Promise<{ name: string; slug: string } | null> {
  const memberships = await ctx.db
    .query('organizationMemberships')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .take(5);
  for (const m of memberships) {
    const org = await ctx.db.get(m.orgId);
    if (org && org.status === 'active')
      return { name: org.name, slug: org.slug };
  }
  return null;
}

// Préférence de notification : le type est-il coupé par ce destinataire ?
// Appelé par `notify()` (convex/lib/notify.ts) AVANT toute écriture : une
// notification d'un type désactivé n'est ni créée ni, a fortiori, envoyée.
export async function isNotificationMuted(
  ctx: Ctx,
  userId: Id<'users'>,
  type: string,
): Promise<boolean> {
  if (!isNotificationPrefType(type)) return false;
  const profile = await profileByUserId(ctx, userId);
  return profile?.mutedNotificationTypes.includes(type) ?? false;
}

// Nom à montrer pour un compte, profil ou pas. Le repli n'expose JAMAIS
// l'adresse e-mail : c'est le défaut qu'on éviterait mal ailleurs.
export function fallbackName(user: Doc<'users'> | null): string {
  return user?.name?.trim() || '';
}

// Paire RANGÉE d'une conversation 1:1 : une seule ligne par couple, quel que
// soit celui qui écrit le premier.
export function sortPair(
  x: Id<'users'>,
  y: Id<'users'>,
): [Id<'users'>, Id<'users'>] {
  return x < y ? [x, y] : [y, x];
}

// Carte de personne (annuaire, abonnés, abonnements) — projection explicite.
export const personCardValidator = v.object({
  handle: v.string(),
  displayName: v.string(),
  photoUrl: v.union(v.string(), v.null()),
  jobTitle: v.union(v.string(), v.null()),
  country: v.union(v.string(), v.null()),
  themes: v.array(v.string()),
  languages: v.array(v.string()),
  followerCount: v.number(),
});

export async function personCard(ctx: Ctx, p: Doc<'memberProfiles'>) {
  return {
    handle: p.handle,
    displayName: p.displayName,
    photoUrl: await photoUrl(ctx, p),
    jobTitle: p.jobTitle ?? null,
    country: p.country ?? null,
    themes: p.themes,
    languages: p.languages,
    followerCount: p.followerCount,
  };
}
