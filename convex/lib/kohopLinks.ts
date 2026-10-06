import {
  KOHOP_LINK_TYPES,
  levelOf,
  type KohopFindingLevel,
  type KohopLinkLevel,
  type KohopLinkType,
} from './kohop';

// KOHOP — links between an author and a candidate reviewer, by RULES.
//
// PURE: an internal query collects the facts (`kohopLinkFacts` in
// `convex/kohopLinkFacts.ts`), this module turns them into findings. Rules are
// reliable and explainable, unlike a model: that is why only the rules can
// BLOCK a designation. The AI check (batch 5) can only add FLAGGED findings.
//
// What the author reads when a designation is refused is one generic
// sentence; the detail below may concern the private life of the candidate and
// is for the review chief only.

/** What the author may declare about their relationship with a candidate. */
export const KOHOP_DECLARED_RELATIONSHIPS = [
  'none',
  'family',
  'personal',
  'hierarchical',
] as const;
export type KohopDeclaredRelationship =
  (typeof KOHOP_DECLARED_RELATIONSHIPS)[number];

export function isDeclaredRelationship(
  value: string,
): value is KohopDeclaredRelationship {
  return (KOHOP_DECLARED_RELATIONSHIPS as readonly string[]).includes(value);
}

// Mailbox providers open to everyone: an external reviewer writing from one is
// flagged (the identity of the person cannot be inferred from the domain).
export const PUBLIC_MAILBOX_DOMAINS: readonly string[] = [
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.fr',
  'hotmail.com',
  'hotmail.fr',
  'outlook.com',
  'outlook.fr',
  'live.com',
  'icloud.com',
  'me.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'aol.com',
  'orange.fr',
  'free.fr',
  'laposte.net',
];

/** Everything the rules need, collected by the query. */
export type LinkFacts = {
  /** The candidate is the author (same account, or same address). */
  isAuthor: boolean;
  /** The candidate is a co-author of the text (same account or address). */
  isCoAuthor: boolean;
  sameOrganization: boolean;
  /** The two form a mentoring pair on the platform. */
  mentoringPair: boolean;
  /** The author reviewed this candidate on KOHOP less than 12 months ago. */
  crossReviewRecent: boolean;
  /** They co-signed a KOHOP contribution less than 3 years ago. */
  coSignedRecently: boolean;
  declaredRelationship?: string;
  sameWorkspace: boolean;
  mutualFollow: boolean;
  /** The candidate's address is on the domain of the author's organization. */
  organizationDomainMatch: boolean;
  /** Times the same author designated this candidate in the last 12 months. */
  previousDesignations: number;
  /** A name in common among the authors of a library document (free text). */
  sharedLibraryAuthorName: boolean;
  /** An external candidate writing from a public mailbox. */
  publicMailbox: boolean;
};

export type LinkFinding = {
  type: KohopLinkType;
  detail: string;
  source?: string;
};

export const NO_FACTS: LinkFacts = {
  isAuthor: false,
  isCoAuthor: false,
  sameOrganization: false,
  mentoringPair: false,
  crossReviewRecent: false,
  coSignedRecently: false,
  sameWorkspace: false,
  mutualFollow: false,
  organizationDomainMatch: false,
  previousDesignations: 0,
  sharedLibraryAuthorName: false,
  publicMailbox: false,
};

/** Findings of the rules, blocking first. Details are in English (internal). */
export function evaluateLinks(facts: LinkFacts): LinkFinding[] {
  const out: LinkFinding[] = [];
  const add = (type: KohopLinkType, detail: string, source?: string) =>
    out.push({ type, detail, ...(source ? { source } : {}) });

  if (facts.isAuthor) add('self', 'The candidate is the author.');
  if (facts.isCoAuthor)
    add('coauthor', 'The candidate is a co-author of the text.');
  if (facts.sameOrganization)
    add(
      'same_organization',
      'Same organization on the platform.',
      'organizationMemberships',
    );
  if (facts.mentoringPair)
    add('mentoring', 'Mentoring pair on the platform.', 'mentorPairs');
  if (facts.crossReviewRecent)
    add(
      'cross_review',
      'The author reviewed this person on KOHOP in the last 12 months.',
      'kohopReviews',
    );
  if (facts.coSignedRecently)
    add(
      'recent_cosign',
      'Co-signed a KOHOP contribution in the last 3 years.',
      'kohopContributions',
    );
  if (
    facts.declaredRelationship &&
    facts.declaredRelationship !== 'none' &&
    isDeclaredRelationship(facts.declaredRelationship)
  ) {
    add(
      'declared_relationship',
      `Relationship declared by the author: ${facts.declaredRelationship}.`,
    );
  }

  if (facts.sameWorkspace)
    add('same_workspace', 'Members of the same workspace.', 'workspaceMembers');
  if (facts.mutualFollow)
    add('mutual_follow', 'They follow each other.', 'follows');
  if (facts.organizationDomainMatch)
    add(
      'organization_domain',
      'Address on the domain of the author’s organization.',
    );
  if (facts.previousDesignations >= 2)
    add(
      'recurrence',
      `Designated ${facts.previousDesignations} times by the same author in the last 12 months.`,
      'kohopReviewers',
    );
  if (facts.sharedLibraryAuthorName)
    add(
      'shared_library_author',
      'A name in common among the authors of a library document (free text: a signal only).',
      'publications',
    );
  if (facts.publicMailbox)
    add('public_mailbox', 'External candidate writing from a public mailbox.');

  return out;
}

/** The level a set of rule findings carries. */
export function linkLevel(facts: LinkFacts): KohopLinkLevel {
  return levelOf(evaluateLinks(facts));
}

export function isBlocking(type: KohopLinkType): boolean {
  return KOHOP_LINK_TYPES[type] === 'blocking';
}

export function findingLevel(type: KohopLinkType): KohopFindingLevel {
  return KOHOP_LINK_TYPES[type];
}

/** Domain of an address, lowercase, or `null`. */
export function emailDomain(email: string | undefined | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at < 0 || at === email.length - 1) return null;
  return email
    .slice(at + 1)
    .trim()
    .toLowerCase();
}

/** Host of a website URL without `www.`, or `null`. */
export function hostOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

/** Does an address sit on an organization's website domain (or a subdomain)? */
export function matchesOrganizationDomain(
  email: string | undefined | null,
  websiteUrl: string | undefined | null,
): boolean {
  const domain = emailDomain(email);
  const host = hostOf(websiteUrl);
  if (!domain || !host) return false;
  if (PUBLIC_MAILBOX_DOMAINS.includes(domain)) return false;
  return domain === host || domain.endsWith(`.${host}`);
}

export function isPublicMailbox(email: string | undefined | null): boolean {
  const domain = emailDomain(email);
  return domain !== null && PUBLIC_MAILBOX_DOMAINS.includes(domain);
}

/** Folded name for the shared-author-name signal (accents and case ignored). */
export function foldName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
