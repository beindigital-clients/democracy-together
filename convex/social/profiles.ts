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

// PROFILS DE PERSONNES (chantier « social ») : édition de son profil, photo,
// préférences, page publique `/membres/<handle>` et annuaire des personnes.
//
// Règle d'or de ce module : un profil que le lecteur n'a pas le droit de voir
// est INDISCERNABLE d'un profil qui n'existe pas. Toutes les lectures
// renvoient `null` (ou n'incluent pas la ligne) dans les deux cas — jamais un
// « profil privé » qui confirmerait qu'il y a quelqu'un derrière le handle.

const linkValidator = v.object({ kind: linkKindValidator, url: v.string() });
const orgValidator = v.union(
  v.object({ name: v.string(), slug: v.string() }),
  v.null(),
);

// --- Mon profil (édition) ------------------------------------------------------

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
  // Le courriel « nouveau message » ne peut partir que si un fournisseur est
  // configuré : l'écran l'annonce au lieu de laisser cocher une promesse.
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

// Codes d'erreur de `saveProfile` — `ConvexError` : le code traverse jusqu'au
// navigateur (le message d'un `Error` nu est masqué en production), et
// l'écran rattache chaque refus au champ qui l'a causé.
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
    // Vide : dérivé du nom à la création, inchangé ensuite.
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

    // Handle : choisi, ou dérivé du nom à la CRÉATION seulement. Un handle
    // n'est jamais recalculé quand le nom change — un lien partagé doit
    // continuer de mener au même profil.
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

// Premier handle libre à partir d'une base dérivée : `base`, `base-2`…
// Borné : au-delà, un suffixe tiré de l'horloge tranche (collision
// pratiquement impossible, et la personne peut toujours en choisir un).
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
    // La photo s'attache à un profil existant : pas d'URL de téléversement
    // pour un compte qui n'en a pas (le stockage n'est pas une décharge).
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

// Vérification de la photo DANS UNE ACTION : seule une action peut relire les
// octets du stockage (`ctx.storage.get`). Trois contrôles, tous nécessaires :
//  1. la taille réelle (bornée : coût et déni de service) ;
//  2. le type DÉCLARÉ au téléversement, qui est celui avec lequel le stockage
//     servira le fichier — il doit être une image matricielle autorisée ;
//  3. le CONTENU réel (signature des premiers octets), qui doit correspondre
//     au type déclaré. Un HTML ou un SVG renommé en `.png` échoue ici.
// Un fichier refusé est EFFACÉ du stockage aussitôt : il n'est référencé par
// rien, et le laisser serait un stockage gratuit pour qui sait téléverser.
export const setPhoto = action({
  args: { storageId: v.id('_storage') },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, { storageId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('UNAUTHENTICATED');

    const meta: { size: number; contentType: string | null } | null =
      await ctx.runQuery(internal.social.profiles.photoMeta, { storageId });
    const blob = await ctx.storage.get(storageId);
    const reject = async (): Promise<never> => {
      await ctx.storage.delete(storageId);
      throw new ConvexError('INVALID_PHOTO');
    };
    if (!meta || !blob) throw new ConvexError('INVALID_PHOTO');
    if (meta.size === 0 || meta.size > PHOTO_MAX_BYTES) return await reject();
    // Type déclaré : celui que le stockage a relevé à l'envoi (et avec lequel
    // il servira le fichier) ; à défaut, celui que porte le blob relu.
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

// --- Page publique `/membres/<handle>` ------------------------------------------

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
  // La page ne s'indexe que si ce drapeau est vrai (visibilité publique d'un
  // membre du réseau). Une page « membres » est servie en `noindex`.
  indexable: v.boolean(),
  updatedAt: v.number(),
});

// Projection EXPLICITE (jamais `{ ...profile }`) : `userId`, les préférences,
// `mutedNotificationTypes`, `messagePolicy`, `photoId` ne sortent pas.
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

// Relation du lecteur CONNECTÉ avec un profil qu'il peut voir : boutons
// suivre / écrire / bloquer. `null` pour un anonyme ou un profil invisible —
// même réponse que pour un handle inconnu.
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

// --- Annuaire des personnes (membres connectés) --------------------------------

// Nombre de lignes candidates lues au plus pour une page d'annuaire. Les
// filtres thème et langue portent sur des TABLEAUX, qu'un index Convex ne
// sait pas filtrer : on lit un lot borné de profils listés, puis on filtre.
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
    // Vrai quand il y avait plus de résultats que la page n'en montre :
    // l'écran invite alors à affiner.
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const viewer = await loadViewer(ctx);
    // Annuaire RÉSERVÉ aux membres du réseau : un anonyme ou un visiteur
    // reçoit une liste vide, pas une erreur (la page est montée côté client).
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
      // `listed` est déjà dans l'index ; on revérifie la visibilité réelle
      // (rôle du propriétaire, blocage) : c'est la même décision que la page.
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

// Dans l'annuaire, le blocage cache dans LES DEUX SENS (on ne retombe pas
// sur la personne qu'on a bloquée en parcourant la liste). La page de profil,
// elle, reste ouverte à celui qui a bloqué, pour qu'il puisse débloquer.
async function visibleInDirectory(
  ctx: QueryCtx,
  viewer: NonNullable<Viewer>,
  p: Doc<'memberProfiles'>,
): Promise<boolean> {
  if (!(await viewerCanSee(ctx, viewer, p))) return false;
  if (p.userId === viewer.userId) return true;
  return !(await isBlockedEitherWay(ctx, viewer.userId, p.userId));
}

// Handles des profils PUBLICS, pour le sitemap. Seuls les profils que la
// visibilité rend indexables y figurent ; la liste est bornée.
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

// --- Export RGPD (droit d'accès, depuis l'espace membre) -------------------------

export const exportMine = query({
  args: {},
  returns: v.union(socialExportValidator, v.null()),
  handler: async (ctx) => {
    const viewer = await loadViewer(ctx);
    if (!viewer) return null;
    return await exportUserDataSocial(ctx, viewer.userId);
  },
});
