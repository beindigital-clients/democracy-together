import { v, ConvexError } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from '../_generated/server';
import { internal } from '../_generated/api';
import type { Doc } from '../_generated/dataModel';
import { requireUser } from '../lib/rbac';
import { enforceRateLimit } from '../lib/rateLimit';
import { emailProviderStatus } from '../email';
import { locale } from '../lib/locales';
import {
  DEFAULT_MESSAGE_POLICY,
  DEFAULT_VISIBILITY,
  PEOPLE_SEARCH_MAX,
  PHOTO_MAX_BYTES,
  PHOTO_TYPES,
  PROFILE_BOUNDS,
  SOCIAL_RATE_LIMITS,
  deriveHandle,
  fold,
  isIndexable,
  isNotificationPrefType,
  isProfileLanguage,
  isProfileTheme,
  isValidHandle,
  isValidProfileLink,
  linkKindValidator,
  messagePolicyValidator,
  nameSortKey,
  normalizeHandle,
  profileSearchText,
  profileVisibilityValidator,
  sniffImageType,
} from '../lib/social';
import {
  displayedOrganization,
  isBlocked,
  isBlockedEitherWay,
  isFollowing,
  loadViewer,
  personCard,
  personCardValidator,
  photoUrl,
  sortPair,
  profileByHandle,
  profileByUserId,
  userIsMember,
  viewerCanSee,
  type Viewer,
} from '../lib/socialAccess';
import { exportUserDataSocial, socialExportValidator } from './account';

// PEOPLE PROFILES ("social" workstream): editing one's profile, photo,
// preferences, public page `/membres/<handle>` and people directory.
//
// Golden rule of this module: a profile the reader is not allowed to see
// is INDISTINGUISHABLE from a profile that does not exist. All reads
// return `null` (or omit the row) in both cases — never a
// "private profile" that would confirm there is someone behind the handle.

const linkValidator = v.object({ kind: linkKindValidator, url: v.string() });
const orgValidator = v.union(
  v.object({ name: v.string(), slug: v.string() }),
  v.null(),
);

// --- My profile (editing) ------------------------------------------------------

const myProfileValidator = v.object({
  exists: v.boolean(),
  isMember: v.boolean(),
  handle: v.string(),
  displayName: v.string(),
  photoUrl: v.union(v.string(), v.null()),
  bio: v.string(),
  jobTitle: v.string(),
  country: v.string(),
  themes: v.array(v.string()),
  languages: v.array(v.string()),
  links: v.array(linkValidator),
  visibility: profileVisibilityValidator,
  messagePolicy: messagePolicyValidator,
  mutedNotificationTypes: v.array(v.string()),
  messageEmail: v.boolean(),
  followerCount: v.number(),
  followingCount: v.number(),
  organization: orgValidator,
  preferredLocale: v.union(locale, v.null()),
  // The "new message" email can only be sent if a provider is
  // configured: the screen says so instead of letting users tick a promise.
  emailAvailable: v.boolean(),
});

export const getMine = query({
  args: {},
  returns: v.union(myProfileValidator, v.null()),
  handler: async (ctx) => {
    const viewer = await loadViewer(ctx);
    if (!viewer) return null;
    const p = await profileByUserId(ctx, viewer.userId);
    const organization = await displayedOrganization(ctx, viewer.userId);
    const emailAvailable = emailProviderStatus().mode !== 'none';
    const base = {
      isMember: viewer.isMember,
      organization,
      preferredLocale: viewer.user.preferredLocale ?? null,
      emailAvailable,
    };
    if (!p) {
      return {
        ...base,
        exists: false,
        handle: '',
        displayName: viewer.user.name?.trim() ?? '',
        photoUrl: null,
        bio: '',
        jobTitle: '',
        country: '',
        themes: [],
        languages: viewer.user.preferredLocale
          ? [viewer.user.preferredLocale]
          : [],
        links: [],
        visibility: DEFAULT_VISIBILITY,
        messagePolicy: DEFAULT_MESSAGE_POLICY,
        mutedNotificationTypes: [],
        messageEmail: false,
        followerCount: 0,
        followingCount: 0,
      };
    }
    return {
      ...base,
      exists: true,
      handle: p.handle,
      displayName: p.displayName,
      photoUrl: await photoUrl(ctx, p),
      bio: p.bio ?? '',
      jobTitle: p.jobTitle ?? '',
      country: p.country ?? '',
      themes: p.themes,
      languages: p.languages,
      links: p.links,
      visibility: p.visibility,
      messagePolicy: p.messagePolicy,
      mutedNotificationTypes: p.mutedNotificationTypes,
      messageEmail: p.messageEmail,
      followerCount: p.followerCount,
      followingCount: p.followingCount,
    };
  },
});

// `saveProfile` error codes — `ConvexError`: the code travels all the way to the
// browser (a bare `Error` message is masked in production), and
// the screen ties each refusal to the field that caused it.
function refuse(code: string): never {
  throw new ConvexError(code);
}

function cleanOptional(value: string, max: number, code: string) {
  const s = value.trim();
  if (s.length > max) refuse(code);
  return s || undefined;
}

export const saveProfile = mutation({
  args: {
    displayName: v.string(),
    // Empty: derived from the name at creation, unchanged afterwards.
    handle: v.string(),
    bio: v.string(),
    jobTitle: v.string(),
    country: v.string(),
    themes: v.array(v.string()),
    languages: v.array(v.string()),
    links: v.array(linkValidator),
    visibility: profileVisibilityValidator,
    messagePolicy: messagePolicyValidator,
    mutedNotificationTypes: v.array(v.string()),
    messageEmail: v.boolean(),
  },
  returns: v.object({ handle: v.string() }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const displayName = args.displayName.trim().replace(/\s+/g, ' ');
    if (
      displayName.length < PROFILE_BOUNDS.displayName.min ||
      displayName.length > PROFILE_BOUNDS.displayName.max
    ) {
      refuse('INVALID_NAME');
    }
    const bio = cleanOptional(args.bio, PROFILE_BOUNDS.bio.max, 'INVALID_BIO');
    const jobTitle = cleanOptional(
      args.jobTitle,
      PROFILE_BOUNDS.jobTitle.max,
      'INVALID_JOB',
    );
    const countryRaw = args.country.trim().toUpperCase();
    if (countryRaw && !/^[A-Z]{2}$/.test(countryRaw)) refuse('INVALID_COUNTRY');
    const country = countryRaw || undefined;

    const themes = [...new Set(args.themes)];
    if (
      themes.length > PROFILE_BOUNDS.themes.max ||
      !themes.every(isProfileTheme)
    ) {
      refuse('INVALID_THEMES');
    }
    const languages = [...new Set(args.languages)];
    if (
      languages.length > PROFILE_BOUNDS.languages.max ||
      !languages.every(isProfileLanguage)
    ) {
      refuse('INVALID_LANGUAGES');
    }
    const links = args.links
      .map((l) => ({ kind: l.kind, url: l.url.trim() }))
      .filter((l) => l.url !== '');
    if (
      links.length > PROFILE_BOUNDS.links.max ||
      !links.every((l) => isValidProfileLink(l.url))
    ) {
      refuse('INVALID_LINK');
    }
    const muted = [...new Set(args.mutedNotificationTypes)];
    if (!muted.every(isNotificationPrefType)) refuse('INVALID_PREFS');

    await enforceRateLimit(ctx, {
      key: `social:profile:${user._id}`,
      ...SOCIAL_RATE_LIMITS.profileSave,
    });

    const existing = await profileByUserId(ctx, user._id);

    // Handle: chosen, or derived from the name at CREATION only. A handle
    // is never recomputed when the name changes — a shared link must
    // keep leading to the same profile.
    const requested = normalizeHandle(args.handle);
    let handle: string;
    if (requested) {
      if (!isValidHandle(requested)) refuse('INVALID_HANDLE');
      const owner = await profileByHandle(ctx, requested);
      if (owner && owner.userId !== user._id) refuse('HANDLE_TAKEN');
      handle = requested;
    } else if (existing) {
      handle = existing.handle;
    } else {
      handle = await freeHandle(ctx, deriveHandle(displayName));
    }

    const fields = {
      handle,
      displayName,
      bio,
      jobTitle,
      country,
      themes,
      languages,
      links,
      visibility: args.visibility,
      messagePolicy: args.messagePolicy,
      mutedNotificationTypes: muted,
      messageEmail: args.messageEmail,
      listed: args.visibility !== 'private',
      searchText: profileSearchText({ displayName, handle, jobTitle, country }),
      nameKey: nameSortKey(displayName),
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, fields);
    } else {
      await ctx.db.insert('memberProfiles', {
        ...fields,
        userId: user._id,
        followerCount: 0,
        followingCount: 0,
      });
    }
    return { handle };
  },
});

// First free handle from a derived base: `base`, `base-2`…
// Bounded: beyond that, a clock-based suffix settles it (collision
// practically impossible, and the person can always choose one).
async function freeHandle(ctx: QueryCtx, base: string): Promise<string> {
  for (let n = 1; n <= 30; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (!isValidHandle(candidate)) continue;
    if (!(await profileByHandle(ctx, candidate))) return candidate;
  }
  return `${base.slice(0, 20)}-${Date.now().toString(36)}`;
}

// --- Photo -------------------------------------------------------------------

export const generatePhotoUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    // The photo attaches to an existing profile: no upload URL
    // for an account that has none (storage is not a dumping ground).
    if (!(await profileByUserId(ctx, user._id))) {
      throw new ConvexError('PROFILE_REQUIRED');
    }
    await enforceRateLimit(ctx, {
      key: `social:photo:${user._id}`,
      ...SOCIAL_RATE_LIMITS.photo,
    });
    return await ctx.storage.generateUploadUrl();
  },
});

// Photo verification IN AN ACTION: only an action can re-read the
// bytes from storage (`ctx.storage.get`). Three checks, all necessary:
//  1. the actual size (bounded: cost and denial of service);
//  2. the type DECLARED at upload, which is the one storage
//     will serve the file with — it must be an allowed raster image;
//  3. the actual CONTENT (signature of the first bytes), which must match
//     the declared type. An HTML or SVG renamed to `.png` fails here.
// A rejected file is DELETED from storage immediately: nothing references it,
// and leaving it would be free storage for anyone who knows how to upload.
export const setPhoto = action({
  args: { storageId: v.id('_storage') },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, { storageId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('UNAUTHENTICATED');
    // Suspended account (accounts workstream): the action has no database, the
    // full guard is replayed by the query that knows the account state.
    await ctx.runQuery(internal.accounts.selfForAction, {});

    const meta: { size: number; contentType: string | null } | null =
      await ctx.runQuery(internal.social.profiles.photoMeta, { storageId });
    const blob = await ctx.storage.get(storageId);
    const reject = async (): Promise<never> => {
      await ctx.storage.delete(storageId);
      throw new ConvexError('INVALID_PHOTO');
    };
    if (!meta || !blob) throw new ConvexError('INVALID_PHOTO');
    if (meta.size === 0 || meta.size > PHOTO_MAX_BYTES) return await reject();
    // Declared type: the one storage recorded at upload (and with which
    // it will serve the file); failing that, the one carried by the re-read blob.
    const declared = meta.contentType ?? blob.type ?? '';
    if (!(PHOTO_TYPES as readonly string[]).includes(declared)) {
      return await reject();
    }
    const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    if (sniffImageType(head) !== declared) return await reject();

    const attached: boolean = await ctx.runMutation(
      internal.social.profiles.attachPhoto,
      { userId, storageId },
    );
    if (!attached) return await reject();
    return { ok: true as const };
  },
});

export const photoMeta = internalQuery({
  args: { storageId: v.id('_storage') },
  returns: v.union(
    v.object({ size: v.number(), contentType: v.union(v.string(), v.null()) }),
    v.null(),
  ),
  handler: async (ctx, { storageId }) => {
    const meta = await ctx.db.system.get(storageId);
    if (!meta) return null;
    return { size: meta.size, contentType: meta.contentType ?? null };
  },
});

export const attachPhoto = internalMutation({
  args: { userId: v.id('users'), storageId: v.id('_storage') },
  returns: v.boolean(),
  handler: async (ctx, { userId, storageId }) => {
    const profile = await profileByUserId(ctx, userId);
    if (!profile) return false;
    const taken = await ctx.db
      .query('memberProfiles')
      .withIndex('by_photoId', (q) => q.eq('photoId', storageId))
      .first();
    if (taken && taken._id !== profile._id) return false;
    const previous = profile.photoId;
    await ctx.db.patch(profile._id, {
      photoId: storageId,
      updatedAt: Date.now(),
    });
    if (previous && previous !== storageId) await ctx.storage.delete(previous);
    return true;
  },
});

export const removePhoto = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const profile = await profileByUserId(ctx, user._id);
    if (!profile?.photoId) return null;
    await ctx.storage.delete(profile.photoId);
    await ctx.db.patch(profile._id, {
      photoId: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

// --- Public page `/membres/<handle>` ------------------------------------------

export const publicProfileValidator = v.object({
  handle: v.string(),
  displayName: v.string(),
  photoUrl: v.union(v.string(), v.null()),
  bio: v.union(v.string(), v.null()),
  jobTitle: v.union(v.string(), v.null()),
  country: v.union(v.string(), v.null()),
  themes: v.array(v.string()),
  languages: v.array(v.string()),
  links: v.array(linkValidator),
  organization: orgValidator,
  followerCount: v.number(),
  followingCount: v.number(),
  // The page is indexed only if this flag is true (public visibility of a
  // network member). A "membres" page is served as `noindex`.
  indexable: v.boolean(),
  updatedAt: v.number(),
});

// EXPLICIT projection (never `{ ...profile }`): `userId`, preferences,
// `mutedNotificationTypes`, `messagePolicy`, `photoId` do not leave.
async function projectPublic(
  ctx: QueryCtx,
  p: Doc<'memberProfiles'>,
  ownerIsMember: boolean,
) {
  return {
    handle: p.handle,
    displayName: p.displayName,
    photoUrl: await photoUrl(ctx, p),
    bio: p.bio ?? null,
    jobTitle: p.jobTitle ?? null,
    country: p.country ?? null,
    themes: p.themes,
    languages: p.languages,
    links: p.links,
    organization: await displayedOrganization(ctx, p.userId),
    followerCount: p.followerCount,
    followingCount: p.followingCount,
    indexable: isIndexable({ visibility: p.visibility, ownerIsMember }),
    updatedAt: p.updatedAt,
  };
}

export const getByHandle = query({
  args: { handle: v.string() },
  returns: v.union(publicProfileValidator, v.null()),
  handler: async (ctx, { handle }) => {
    const normalized = normalizeHandle(handle);
    if (!isValidHandle(normalized)) return null;
    const p = await profileByHandle(ctx, normalized);
    if (!p) return null;
    const viewer = await loadViewer(ctx);
    if (!(await viewerCanSee(ctx, viewer, p))) return null;
    return await projectPublic(ctx, p, await userIsMember(ctx, p.userId));
  },
});

// Relationship of the SIGNED-IN reader with a profile they can see: buttons
// follow / write / block. `null` for an anonymous user or an invisible profile —
// same response as for an unknown handle.
export const relationship = query({
  args: { handle: v.string() },
  returns: v.union(
    v.object({
      userId: v.id('users'),
      isSelf: v.boolean(),
      following: v.boolean(),
      followsMe: v.boolean(),
      blockedByMe: v.boolean(),
      viewerIsMember: v.boolean(),
      viewerHasProfile: v.boolean(),
      conversationId: v.union(v.id('conversations'), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, { handle }) => {
    const viewer = await loadViewer(ctx);
    if (!viewer) return null;
    const normalized = normalizeHandle(handle);
    if (!isValidHandle(normalized)) return null;
    const p = await profileByHandle(ctx, normalized);
    if (!p || !(await viewerCanSee(ctx, viewer, p))) return null;
    const isSelf = p.userId === viewer.userId;
    const [a, b] = sortPair(viewer.userId, p.userId);
    const conversation = isSelf
      ? null
      : await ctx.db
          .query('conversations')
          .withIndex('by_pair', (q) => q.eq('userA', a).eq('userB', b))
          .unique();
    return {
      userId: p.userId,
      isSelf,
      following: isSelf
        ? false
        : await isFollowing(ctx, viewer.userId, p.userId),
      followsMe: isSelf
        ? false
        : await isFollowing(ctx, p.userId, viewer.userId),
      blockedByMe: isSelf
        ? false
        : await isBlocked(ctx, viewer.userId, p.userId),
      viewerIsMember: viewer.isMember,
      viewerHasProfile:
        isSelf || (await profileByUserId(ctx, viewer.userId)) !== null,
      conversationId: conversation?._id ?? null,
    };
  },
});

// --- People directory (signed-in members) --------------------------------

// Maximum number of candidate rows read for a directory page. The
// theme and language filters apply to ARRAYS, which a Convex index cannot
// filter: we read a bounded batch of listed profiles, then filter.
const PEOPLE_SCAN_MAX = 400;

export const search = query({
  args: {
    q: v.optional(v.string()),
    theme: v.optional(v.string()),
    language: v.optional(v.string()),
    country: v.optional(v.string()),
  },
  returns: v.object({
    items: v.array(personCardValidator),
    // True when there were more results than the page shows:
    // the screen then invites the user to refine.
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const viewer = await loadViewer(ctx);
    // Directory RESERVED for network members: an anonymous user or a visitor
    // receives an empty list, not an error (the page is mounted client-side).
    if (!viewer?.isMember) return { items: [], truncated: false };

    const q = fold((args.q ?? '').slice(0, 100));
    const country = args.country?.trim().toUpperCase() || undefined;
    const candidates = q
      ? await ctx.db
          .query('memberProfiles')
          .withSearchIndex('search_text', (s) => {
            const base = s.search('searchText', q).eq('listed', true);
            return country ? base.eq('country', country) : base;
          })
          .take(PEOPLE_SCAN_MAX)
      : await ctx.db
          .query('memberProfiles')
          .withIndex('by_listed_and_nameKey', (i) => i.eq('listed', true))
          .take(PEOPLE_SCAN_MAX);

    const items = [];
    let truncated = candidates.length === PEOPLE_SCAN_MAX;
    for (const p of candidates) {
      // `listed` is already in the index; we re-check actual visibility
      // (owner's role, blocking): it is the same decision as the page.
      if (p.visibility === 'private') continue;
      if (args.theme && !p.themes.includes(args.theme)) continue;
      if (args.language && !p.languages.includes(args.language)) continue;
      if (country && p.country !== country) continue;
      if (!(await visibleInDirectory(ctx, viewer, p))) continue;
      if (items.length === PEOPLE_SEARCH_MAX) {
        truncated = true;
        break;
      }
      items.push(await personCard(ctx, p));
    }
    return { items, truncated };
  },
});

// In the directory, blocking hides in BOTH DIRECTIONS (you do not run into
// the person you blocked while browsing the list). The profile page,
// however, stays open to the one who blocked, so they can unblock.
async function visibleInDirectory(
  ctx: QueryCtx,
  viewer: NonNullable<Viewer>,
  p: Doc<'memberProfiles'>,
): Promise<boolean> {
  if (!(await viewerCanSee(ctx, viewer, p))) return false;
  if (p.userId === viewer.userId) return true;
  return !(await isBlockedEitherWay(ctx, viewer.userId, p.userId));
}

// Handles of PUBLIC profiles, for the sitemap. Only profiles that
// visibility makes indexable are included; the list is bounded.
const SITEMAP_MAX = 1000;

export const listPublicHandles = query({
  args: {},
  returns: v.array(v.object({ handle: v.string(), updatedAt: v.number() })),
  handler: async (ctx) => {
    const out: { handle: string; updatedAt: number }[] = [];
    const rows = await ctx.db
      .query('memberProfiles')
      .withIndex('by_listed_and_nameKey', (i) => i.eq('listed', true))
      .take(SITEMAP_MAX * 2);
    for (const p of rows) {
      if (p.visibility !== 'public') continue;
      if (!(await userIsMember(ctx, p.userId))) continue;
      out.push({ handle: p.handle, updatedAt: p.updatedAt });
      if (out.length === SITEMAP_MAX) break;
    }
    return out;
  },
});

// --- GDPR export (right of access, from the member area) -------------------------

export const exportMine = query({
  args: {},
  returns: v.union(socialExportValidator, v.null()),
  handler: async (ctx) => {
    const viewer = await loadViewer(ctx);
    if (!viewer) return null;
    return await exportUserDataSocial(ctx, viewer.userId);
  },
});
