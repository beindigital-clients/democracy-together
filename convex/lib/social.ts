// PERSON-TO-PERSON SOCIAL NETWORK — PURE rules (profile, following,
// messaging).
//
// This module imports no Convex server type: the interface reads it through
// the `@convex/lib/social` alias (field bounds, vocabularies, visibility
// decision), as it already reads `@convex/lib/validation`. A field's counter,
// its `maxLength` and the server rejection therefore read THE SAME number.
//
// Access decisions (who sees a profile, who can write to whom) are pure
// functions: that is what lets them be tested as a truth table
// (tests/unit/social-rules.test.ts) independently of the database.

import { v } from 'convex/values';
import { DIRECTORY_THEMES, fold, countryTerms } from './directory';
import { PUB_LANGS } from './publications';

// --- Vocabularies ------------------------------------------------------------

// Profile visibility. `members` = VALIDATED network members (role ≥ member),
// not "any signed-in account": a self-registered visitor does not belong to
// the network, and the setting is called "network members".
export const PROFILE_VISIBILITIES = ['private', 'members', 'public'] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITIES)[number];
export const profileVisibilityValidator = v.union(
  v.literal('private'),
  v.literal('members'),
  v.literal('public'),
);

// "Who can write to me". `followed` = the people I FOLLOW (I am the one who
// opens the door by following someone), not those who follow me: following
// is one-way, and letting any follower write would amount to "any member".
export const MESSAGE_POLICIES = ['nobody', 'followed', 'members'] as const;
export type MessagePolicy = (typeof MESSAGE_POLICIES)[number];
export const messagePolicyValidator = v.union(
  v.literal('nobody'),
  v.literal('followed'),
  v.literal('members'),
);

// Default values for a newly created profile. A profile only exists if the
// person saves it: so this is not a setting imposed without their knowledge.
// We pick the INTERMEDIATE level (visible to members only, not to the web) —
// public indexing remains an explicit choice (GDPR, art. 25).
export const DEFAULT_VISIBILITY: ProfileVisibility = 'members';
export const DEFAULT_MESSAGE_POLICY: MessagePolicy = 'members';

// Profile links: a type (for the icon and label) and an address.
export const LINK_KINDS = [
  'website',
  'linkedin',
  'x',
  'mastodon',
  'bluesky',
  'orcid',
  'researchgate',
  'other',
] as const;
export type LinkKind = (typeof LINK_KINDS)[number];
export const linkKindValidator = v.union(
  ...LINK_KINDS.map((k) => v.literal(k)),
);

// Themes and languages: the vocabularies ALREADY maintained by the directory
// (10 areas of expertise) and by the library (the languages served). A second
// list would diverge at the first addition.
export const PROFILE_THEMES = DIRECTORY_THEMES;
export const PROFILE_LANGUAGES = PUB_LANGS;

export function isProfileTheme(value: string): boolean {
  return (PROFILE_THEMES as readonly string[]).includes(value);
}
export function isProfileLanguage(value: string): boolean {
  return (PROFILE_LANGUAGES as readonly string[]).includes(value);
}

// --- Bounds ------------------------------------------------------------------

export const PROFILE_BOUNDS = {
  displayName: { min: 2, max: 80 },
  bio: { max: 1000 },
  jobTitle: { max: 120 },
  themes: { max: 10 },
  languages: { max: PUB_LANGS.length },
  links: { max: 5 },
  linkUrl: { max: 300 },
  handle: { min: 3, max: 30 },
} as const;

// Private message: bounded like a short comment. A message is not a post;
// beyond that, it is a document to share some other way.
export const MESSAGE_BOUNDS = { min: 1, max: 2000 } as const;

// Reason for a report: short, optional.
export const REPORT_REASON_MAX = 500;

// Photo: 2 MB, three raster image formats. No SVG: it is an active document
// (scripts, links); served from storage, it would execute.
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number];

// --- Rate limiting -----------------------------------------------------------
//
// Declared HERE and not in `RATE_LIMITS` (convex/lib/rateLimit.ts): the
// "social" workstream keeps its limits together, and the keys carry the
// `social:` prefix — no possible collision with the existing counters.
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
export const SOCIAL_RATE_LIMITS = {
  // A sustained two-person exchange stays far from 30 messages in 10 minutes; a
  // spamming script reaches it in a few seconds.
  message: { max: 30, windowMs: 10 * MINUTE },
  // Opening conversations with strangers is the spammer's move: a daily cap
  // separate from the message rate.
  newConversation: { max: 20, windowMs: 24 * HOUR },
  follow: { max: 60, windowMs: HOUR },
  block: { max: 30, windowMs: HOUR },
  report: { max: 20, windowMs: HOUR },
  profileSave: { max: 30, windowMs: HOUR },
  photo: { max: 20, windowMs: HOUR },
  // People directory search: a query cannot write a counter; the enumeration
  // cap is therefore the page SIZE (see `PEOPLE_SEARCH_MAX`), not a rate.
  // "New message" e-mail: at most one per conversation per half hour.
  messageEmail: { max: 1, windowMs: 30 * MINUTE },
} as const;

// Maximum size of a people directory page: bounds the query's cost AND what
// a member can scrape in one request.
export const PEOPLE_SEARCH_MAX = 48;

// --- Public identifier ("handle") --------------------------------------------
//
// Lowercase letters, digits and hyphens, 3 to 30 characters, no leading or
// trailing hyphen. It is a URL segment (`/membres/<handle>`): nothing that
// requires encoding, nothing that looks like a site route.
const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/;

// Names a person cannot take: they would impersonate the institution or a
// page of the site.
export const RESERVED_HANDLES = [
  'admin',
  'administrateur',
  'moderateur',
  'moderation',
  'support',
  'contact',
  'equipe',
  'democracy-together',
  'democracytogether',
  'membres',
  'membre',
  'messages',
  'profil',
  'reseau',
  'nouveau',
  'api',
  'root',
  'system',
  'systeme',
] as const;

export function normalizeHandle(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidHandle(handle: string): boolean {
  return (
    HANDLE_RE.test(handle) &&
    !handle.includes('--') &&
    !(RESERVED_HANDLES as readonly string[]).includes(handle)
  );
}

// Handle DERIVED from the display name when the person does not choose one.
// Stable: it is only computed when the profile is created, never recomputed
// when the name changes (a shared link must keep leading to the same
// profile).
export function deriveHandle(displayName: string): string {
  const base = displayName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, PROFILE_BOUNDS.handle.max - 4)
    .replace(/-+$/g, '');
  const candidate = base.length >= PROFILE_BOUNDS.handle.min ? base : '';
  if (!candidate || !isValidHandle(candidate)) {
    return candidate ? `${candidate}-dt` : 'membre-dt';
  }
  return candidate;
}

// --- Links -------------------------------------------------------------------

// A profile link is ABSOLUTE, over HTTPS, with no embedded credentials
// (`https://user:pass@…` is used for phishing), and of bounded length. The
// `http:` scheme is refused: a public profile page does not send its readers
// to a cleartext transport.
export function isValidProfileLink(value: string): boolean {
  const s = value.trim();
  if (!s || s.length > PROFILE_BOUNDS.linkUrl.max) return false;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  // A host without a dot (`https://localhost`, `https://intranet`) is not a
  // public address.
  return url.hostname.includes('.');
}

// --- Access decisions (pure) -------------------------------------------------

export type ProfileAccessInput = {
  visibility: ProfileVisibility;
  isSelf: boolean;
  // Does the owner belong to the network (role ≥ member)? A visitor's profile,
  // or a demoted account's, is only visible to themselves, whatever the saved
  // setting.
  ownerIsMember: boolean;
  viewerIsMember: boolean;
  // The owner has blocked the reader: the profile is invisible to them.
  blockedByOwner: boolean;
};

export function canViewProfile(input: ProfileAccessInput): boolean {
  if (input.isSelf) return true;
  if (!input.ownerIsMember) return false;
  if (input.blockedByOwner) return false;
  switch (input.visibility) {
    case 'public':
      return true;
    case 'members':
      return input.viewerIsMember;
    case 'private':
      return false;
  }
}

// Is the profile INDEXABLE (public page, metadata, sitemap)?
export function isIndexable(input: {
  visibility: ProfileVisibility;
  ownerIsMember: boolean;
}): boolean {
  return input.visibility === 'public' && input.ownerIsMember;
}

export type MessageAccessInput = {
  senderIsMember: boolean;
  recipientIsMember: boolean;
  // Blocking in EITHER direction: it closes the conversation both ways.
  blockedEitherWay: boolean;
  recipientPolicy: MessagePolicy;
  // Does the recipient follow the sender?
  recipientFollowsSender: boolean;
  // Has the recipient ALREADY written in this conversation? Whoever opened the
  // exchange cannot be refused their counterpart's reply: without this rule, a
  // person set to "nobody" could write to everyone without anyone being able
  // to answer them.
  recipientHasWritten: boolean;
  isSelf: boolean;
};

export type MessageRefusal = 'SELF' | 'NOT_MEMBER' | 'BLOCKED' | 'POLICY';

export function messageRefusal(
  input: MessageAccessInput,
): MessageRefusal | null {
  if (input.isSelf) return 'SELF';
  if (!input.senderIsMember || !input.recipientIsMember) return 'NOT_MEMBER';
  if (input.blockedEitherWay) return 'BLOCKED';
  if (input.recipientHasWritten) return null;
  switch (input.recipientPolicy) {
    case 'members':
      return null;
    case 'followed':
      return input.recipientFollowsSender ? null : 'POLICY';
    case 'nobody':
      return 'POLICY';
  }
}

// --- Notification preferences ------------------------------------------------
//
// The types emitted by `notify()` (convex/lib/notify.ts) that a person can
// turn off. The list is CLOSED: a preference saved outside this vocabulary
// is refused on write. A type emitted by another module and absent from here
// simply stays always on (safe default: we do not lose a notification for
// lack of having catalogued it).
export const NOTIFICATION_PREF_TYPES = [
  'publication_published',
  'publication_rejected',
  'membership_approved',
  'membership_rejected',
  'tribune_comment',
  'tribune_thread',
  'peer_review_assigned',
  'peer_review_decided',
  'publication_ai_flagged',
  'social_follow',
  'social_message',
] as const;
export type NotificationPrefType = (typeof NOTIFICATION_PREF_TYPES)[number];

export function isNotificationPrefType(value: string): boolean {
  return (NOTIFICATION_PREF_TYPES as readonly string[]).includes(value);
}

// Types emitted by this workstream.
export const SOCIAL_NOTIF = {
  FOLLOW: 'social_follow',
  MESSAGE: 'social_message',
} as const satisfies Record<string, NotificationPrefType>;

// --- Photo: actual content ----------------------------------------------------
//
// The type announced on upload is a client DECLARATION; so is the type
// recorded by storage (it copies the request header). Only the first bytes
// say what the file is. A "portrait.png" that starts with `<svg` or `%PDF` is
// refused.
export function sniffImageType(bytes: Uint8Array): PhotoType | null {
  const b = bytes;
  if (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    b.length >= 12 &&
    b[0] === 0x52 && // R
    b[1] === 0x49 && // I
    b[2] === 0x46 && // F
    b[3] === 0x46 && // F
    b[8] === 0x57 && // W
    b[9] === 0x45 && // E
    b[10] === 0x42 && // B
    b[11] === 0x50 // P
  ) {
    return 'image/webp';
  }
  return null;
}

// --- Search ------------------------------------------------------------------

// A profile's search haystack: name, handle, job title, and country (code
// and names in the site's languages, like the organisation directory). The
// biography is NOT included: searching free text would turn the directory
// into a search engine for personal sentences.
export function profileSearchText(p: {
  displayName: string;
  handle: string;
  jobTitle?: string;
  country?: string;
}): string {
  return fold(
    `${p.displayName} ${p.handle.replace(/-/g, ' ')} ${p.jobTitle ?? ''} ${
      p.country ? countryTerms(p.country) : ''
    }`,
  );
}

// Alphabetical sort key for a name (case- and accent-insensitive).
export function nameSortKey(displayName: string): string {
  return fold(displayName);
}

export { fold };
