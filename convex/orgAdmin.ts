import { ConvexError, v } from 'convex/values';
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { requireNetworkRole, requireUser, rank } from './lib/rbac';
import { locale } from './lib/locales';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { COUNTER, bumpCounter, trackOrganizationStatus } from './lib/counters';
import { notify } from './lib/notify';
import { enforceRateLimit } from './lib/rateLimit';
import { isEmail, FIELD_MAX } from './lib/validation';
import { normalizeEmail, validateDirectoryFields } from './lib/onboarding';
import { emailProviderStatus } from './email';
import { organizationRevisionFields } from './lib/tables/comptes';

// ORGANISATIONS DU RÉSEAU (F-21, chantier comptes) : rattachement compte ↔
// organisation, gestion par le RESPONSABLE (`orgRole: 'owner'`), édition de
// la fiche d'annuaire soumise à validation, et lien avec les publications.
//
// La table de rattachement existait (`organizationMemberships`, créée à
// l'approbation d'une candidature) mais rien ne s'en servait. Son vocabulaire
// est gardé : `owner` = responsable, `member` = membre ; l'ancien `editor`,
// jamais attribué, vaut membre.
//
// POURQUOI LA FICHE PASSE PAR UN MODÉRATEUR. La fiche publique parle au nom du
// réseau : c'est la validation d'un modérateur qui a fait entrer
// l'organisation dans l'annuaire (F-22). Laisser son responsable en changer
// librement le NOM, le SITE ou le LOGO rouvrirait ce que cette validation
// ferme — usurper le nom d'un autre institut, remplacer le site par une page
// d'hameçonnage, afficher un logo trompeur. La révision est donc proposée,
// relue, puis appliquée ; la fiche en ligne reste servie telle quelle entre
// les deux. Une fiche « à compléter » (créée sans champs d'annuaire) devient
// publique à l'approbation de sa première révision complète.

// Plafonds : une organisation n'est pas un fournisseur de comptes. Au-delà,
// passer par le secrétariat (création directe au back-office).
const MAX_MEMBERS_PER_ORG = 50;
const INVITE_LIMIT = { max: 20, windowMs: 24 * 60 * 60 * 1000 };
const REVISION_LIMIT = { max: 10, windowMs: 24 * 60 * 60 * 1000 };
const LOGO_UPLOAD_LIMIT = { max: 10, windowMs: 60 * 60 * 1000 };
export const LOGO_MAX_BYTES = 1024 * 1024;

type OrgRole = 'owner' | 'member';

function normalizeOrgRole(
  role: Doc<'organizationMemberships'>['orgRole'],
): OrgRole {
  return role === 'owner' ? 'owner' : 'member';
}

async function membershipOf(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<'organizations'>,
  userId: Id<'users'>,
) {
  return await ctx.db
    .query('organizationMemberships')
    .withIndex('by_org_user', (q) => q.eq('orgId', orgId).eq('userId', userId))
    .first();
}

/** Le compte courant est-il RESPONSABLE de l'organisation ? Sinon refus. */
async function requireOrgOwner(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<'organizations'>,
): Promise<{ user: Doc<'users'>; org: Doc<'organizations'> }> {
  const user = await requireUser(ctx);
  const org = await ctx.db.get(orgId);
  if (!org) throw new ConvexError('NOT_FOUND');
  const membership = await membershipOf(ctx, orgId, user._id);
  if (!membership || normalizeOrgRole(membership.orgRole) !== 'owner') {
    throw new ConvexError('NOT_ORG_OWNER');
  }
  return { user, org };
}

async function ownerCount(
  ctx: MutationCtx,
  orgId: Id<'organizations'>,
): Promise<number> {
  const rows = await ctx.db
    .query('organizationMemberships')
    .withIndex('by_org', (q) => q.eq('orgId', orgId))
    .take(MAX_MEMBERS_PER_ORG + 10);
  return rows.filter((r) => r.orgRole === 'owner').length;
}

async function logoUrl(
  ctx: QueryCtx,
  fileId: Id<'_storage'> | undefined,
): Promise<string | null> {
  return fileId ? await ctx.storage.getUrl(fileId) : null;
}

// --- Espace membre : mes organisations --------------------------------------

export const myOrganizations = query({
  args: {},
  returns: v.array(
    v.object({
      orgId: v.id('organizations'),
      name: v.string(),
      slug: v.string(),
      status: v.union(
        v.literal('active'),
        v.literal('pending'),
        v.literal('suspended'),
      ),
      orgRole: v.union(v.literal('owner'), v.literal('member')),
    }),
  ),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const memberships = await ctx.db
      .query('organizationMemberships')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .take(20);
    const out = [];
    for (const m of memberships) {
      const org = await ctx.db.get(m.orgId);
      if (!org) continue;
      out.push({
        orgId: org._id,
        name: org.name,
        slug: org.slug,
        status: org.status,
        orgRole: normalizeOrgRole(m.orgRole),
      });
    }
    return out;
  },
});

const revisionView = v.object({
  _id: v.id('organizationRevisions'),
  status: v.union(
    v.literal('pending'),
    v.literal('approved'),
    v.literal('rejected'),
    v.literal('superseded'),
  ),
  fields: organizationRevisionFields,
  logoUrl: v.union(v.string(), v.null()),
  removeLogo: v.boolean(),
  submittedAt: v.number(),
  reviewedAt: v.union(v.number(), v.null()),
  reviewNotes: v.union(v.string(), v.null()),
});

async function projectRevision(ctx: QueryCtx, r: Doc<'organizationRevisions'>) {
  return {
    _id: r._id,
    status: r.status,
    fields: r.fields,
    logoUrl: await logoUrl(ctx, r.logoFileId),
    removeLogo: r.removeLogo ?? false,
    submittedAt: r.submittedAt,
    reviewedAt: r.reviewedAt ?? null,
    reviewNotes: r.reviewNotes ?? null,
  };
}

// Vue de gestion d'UNE organisation, pour un de ses comptes. Les ADRESSES des
// collègues ne sont montrées qu'au responsable, qui en a besoin pour gérer ;
// un simple membre voit les noms.
export const organizationForMember = query({
  args: { orgId: v.id('organizations') },
  returns: v.object({
    org: v.object({
      _id: v.id('organizations'),
      name: v.string(),
      slug: v.string(),
      status: v.union(
        v.literal('active'),
        v.literal('pending'),
        v.literal('suspended'),
      ),
      country: v.string(),
      region: v.string(),
      themes: v.array(v.string()),
      languages: v.array(v.string()),
      description: v.union(v.string(), v.null()),
      websiteUrl: v.union(v.string(), v.null()),
      showMembers: v.boolean(),
      logoUrl: v.union(v.string(), v.null()),
    }),
    myRole: v.union(v.literal('owner'), v.literal('member')),
    members: v.array(
      v.object({
        userId: v.id('users'),
        name: v.union(v.string(), v.null()),
        email: v.union(v.string(), v.null()),
        orgRole: v.union(v.literal('owner'), v.literal('member')),
        isSelf: v.boolean(),
      }),
    ),
    pendingRevision: v.union(revisionView, v.null()),
    lastDecision: v.union(revisionView, v.null()),
  }),
  handler: async (ctx, { orgId }) => {
    const user = await requireUser(ctx);
    const org = await ctx.db.get(orgId);
    if (!org) throw new ConvexError('NOT_FOUND');
    const mine = await membershipOf(ctx, orgId, user._id);
    if (!mine) throw new ConvexError('NOT_ORG_MEMBER');
    const myRole = normalizeOrgRole(mine.orgRole);
    const rows = await ctx.db
      .query('organizationMemberships')
      .withIndex('by_org', (q) => q.eq('orgId', orgId))
      .take(MAX_MEMBERS_PER_ORG + 10);
    const members = [];
    for (const r of rows) {
      const u = await ctx.db.get(r.userId);
      if (!u) continue;
      members.push({
        userId: u._id,
        name: u.name ?? null,
        email:
          myRole === 'owner' || u._id === user._id ? (u.email ?? null) : null,
        orgRole: normalizeOrgRole(r.orgRole),
        isSelf: u._id === user._id,
      });
    }
    const pending = await ctx.db
      .query('organizationRevisions')
      .withIndex('by_org_and_status', (q) =>
        q.eq('orgId', orgId).eq('status', 'pending'),
      )
      .first();
    const decisions = [];
    for (const status of ['approved', 'rejected'] as const) {
      const last = await ctx.db
        .query('organizationRevisions')
        .withIndex('by_org_and_status', (q) =>
          q.eq('orgId', orgId).eq('status', status),
        )
        .order('desc')
        .first();
      if (last) decisions.push(last);
    }
    decisions.sort((a, b) => (b.reviewedAt ?? 0) - (a.reviewedAt ?? 0));
    return {
      org: {
        _id: org._id,
        name: org.name,
        slug: org.slug,
        status: org.status,
        country: org.country,
        region: org.region,
        themes: org.themes,
        languages: org.languages,
        description: org.description ?? null,
        websiteUrl: org.websiteUrl ?? null,
        showMembers: org.showMembers ?? false,
        logoUrl: await logoUrl(ctx, org.logoFileId),
      },
      myRole,
      members,
      pendingRevision: pending ? await projectRevision(ctx, pending) : null,
      lastDecision: decisions[0]
        ? await projectRevision(ctx, decisions[0])
        : null,
    };
  },
});

// --- Rattachements -----------------------------------------------------------

// Le responsable invite un COLLÈGUE. Une adresse inconnue devient un compte
// (rang « membre » : l'organisation est membre validée du réseau) ; un compte
// existant est rattaché sans que son rôle soit jamais abaissé. L'e-mail
// d'accueil part par l'adaptateur commun (convex/email.ts).
export const inviteColleague = mutation({
  args: {
    orgId: v.id('organizations'),
    email: v.string(),
    locale: v.optional(locale),
  },
  returns: v.object({
    created: v.boolean(),
    emailMode: v.union(
      v.literal('configured'),
      v.literal('simulated'),
      v.literal('none'),
    ),
  }),
  handler: async (ctx, args) => {
    const { user, org } = await requireOrgOwner(ctx, args.orgId);
    const email = normalizeEmail(args.email);
    if (!isEmail(email)) throw new ConvexError('INVALID_EMAIL');
    await enforceRateLimit(ctx, {
      key: `orgInvite:${user._id}`,
      ...INVITE_LIMIT,
    });
    const current = await ctx.db
      .query('organizationMemberships')
      .withIndex('by_org', (q) => q.eq('orgId', org._id))
      .take(MAX_MEMBERS_PER_ORG + 1);
    if (current.length >= MAX_MEMBERS_PER_ORG) {
      throw new ConvexError('ORG_MEMBER_LIMIT');
    }

    let target = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', email))
      .first();
    let created = false;
    if (!target) {
      const id = await ctx.db.insert('users', {
        email,
        role: 'membre',
        ...(args.locale ? { preferredLocale: args.locale } : {}),
      });
      await bumpCounter(ctx, COUNTER.USERS, 1);
      target = (await ctx.db.get(id))!;
      created = true;
      await recordAudit(ctx, {
        actorId: user._id,
        action: AUDIT.USER_CREATED,
        targetId: id,
        metadata: { via: 'organization', organizationId: org._id },
      });
    } else if (target.suspendedAt !== undefined) {
      // Un compte suspendu ne se réintroduit pas par la porte d'une
      // organisation : c'est à l'administrateur de lever la suspension.
      throw new ConvexError('ACCOUNT_SUSPENDED');
    } else if (rank(target.role) < rank('membre')) {
      await ctx.db.patch(target._id, { role: 'membre' });
      await recordAudit(ctx, {
        actorId: user._id,
        action: AUDIT.USER_ROLE_CHANGED,
        targetId: target._id,
        metadata: { role: 'membre', via: 'organization' },
      });
    }

    if (await membershipOf(ctx, org._id, target._id)) {
      throw new ConvexError('ALREADY_MEMBER');
    }
    await ctx.db.insert('organizationMemberships', {
      userId: target._id,
      orgId: org._id,
      orgRole: 'member',
      createdAt: Date.now(),
    });
    await recordAudit(ctx, {
      actorId: user._id,
      action: AUDIT.ORG_MEMBER_ADDED,
      targetId: org._id,
      metadata: { userId: target._id, orgRole: 'member', via: 'owner' },
    });
    await notify(ctx, {
      userId: target._id,
      type: 'org_member_added',
      titleKey: 'orgMemberAdded',
      params: { org: org.name },
      link: '/espace-membre/organisation',
    });
    await ctx.scheduler.runAfter(0, internal.accounts.sendWelcomeEmail, {
      email,
      locale: args.locale ?? target.preferredLocale ?? 'fr',
      organizationName: org.name,
    });
    return { created, emailMode: emailProviderStatus().mode };
  },
});

// Retrait d'un rattachement : par le responsable, ou par le membre lui-même
// (« quitter »). Jamais le DERNIER responsable — l'organisation n'aurait plus
// personne pour tenir sa fiche.
export const removeMember = mutation({
  args: { orgId: v.id('organizations'), userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, { orgId, userId }) => {
    const user = await requireUser(ctx);
    const mine = await membershipOf(ctx, orgId, user._id);
    if (!mine) throw new ConvexError('NOT_ORG_MEMBER');
    const self = userId === user._id;
    if (!self && normalizeOrgRole(mine.orgRole) !== 'owner') {
      throw new ConvexError('NOT_ORG_OWNER');
    }
    const target = await membershipOf(ctx, orgId, userId);
    if (!target) throw new ConvexError('NOT_FOUND');
    if (
      normalizeOrgRole(target.orgRole) === 'owner' &&
      (await ownerCount(ctx, orgId)) <= 1
    ) {
      throw new ConvexError('LAST_ORG_OWNER');
    }
    await ctx.db.delete(target._id);
    await recordAudit(ctx, {
      actorId: user._id,
      action: AUDIT.ORG_MEMBER_REMOVED,
      targetId: orgId,
      metadata: { userId, self },
    });
    return null;
  },
});

export const setMemberRole = mutation({
  args: {
    orgId: v.id('organizations'),
    userId: v.id('users'),
    orgRole: v.union(v.literal('owner'), v.literal('member')),
  },
  returns: v.null(),
  handler: async (ctx, { orgId, userId, orgRole }) => {
    const { user } = await requireOrgOwner(ctx, orgId);
    const target = await membershipOf(ctx, orgId, userId);
    if (!target) throw new ConvexError('NOT_FOUND');
    if (normalizeOrgRole(target.orgRole) === orgRole) return null;
    if (orgRole === 'member' && (await ownerCount(ctx, orgId)) <= 1) {
      throw new ConvexError('LAST_ORG_OWNER');
    }
    await ctx.db.patch(target._id, { orgRole });
    await recordAudit(ctx, {
      actorId: user._id,
      action: AUDIT.ORG_MEMBER_ROLE_CHANGED,
      targetId: orgId,
      metadata: { userId, orgRole },
    });
    return null;
  },
});

// --- Fiche : logo -------------------------------------------------------------

export const generateLogoUploadUrl = mutation({
  args: { orgId: v.id('organizations') },
  returns: v.string(),
  handler: async (ctx, { orgId }) => {
    const { user } = await requireOrgOwner(ctx, orgId);
    await enforceRateLimit(ctx, {
      key: `orgLogo:${user._id}`,
      ...LOGO_UPLOAD_LIMIT,
    });
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Type d'image reconnu à sa SIGNATURE (premiers octets), jamais au type
 * annoncé par le navigateur. SVG exclu à dessein : c'est du XML qui peut
 * porter du script, servi depuis notre domaine de stockage.
 */
export function sniffImageType(
  bytes: Uint8Array,
): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  const starts = (sig: number[], offset = 0) =>
    sig.every((b, i) => bytes[offset + i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (starts([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }
  return null;
}

export const registerLogoUpload = internalMutation({
  args: {
    orgId: v.id('organizations'),
    fileId: v.id('_storage'),
    contentType: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { orgId, fileId, contentType }) => {
    const { user } = await requireOrgOwner(ctx, orgId);
    await ctx.db.insert('organizationLogoUploads', {
      orgId,
      uploadedBy: user._id,
      fileId,
      contentType,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const assertOwnerForAction = internalQuery({
  args: { orgId: v.id('organizations') },
  returns: v.null(),
  handler: async (ctx, { orgId }) => {
    await requireOrgOwner(ctx, orgId);
    return null;
  },
});

export const discardFile = internalMutation({
  args: { fileId: v.id('_storage') },
  returns: v.null(),
  handler: async (ctx, { fileId }) => {
    try {
      await ctx.storage.delete(fileId);
    } catch {
      // Déjà absent.
    }
    return null;
  },
});

// VÉRIFICATION DU CONTENU du logo téléversé : l'action relit le fichier dans
// le stockage (une mutation ne le peut pas), en contrôle la taille et la
// signature, et ne l'enregistre qu'ensuite. Un fichier refusé est supprimé
// sur-le-champ : il ne reste pas d'orphelin servi par une URL.
export const attachLogo = action({
  args: { orgId: v.id('organizations'), fileId: v.id('_storage') },
  returns: v.union(
    v.object({ ok: v.literal(true) }),
    v.object({
      ok: v.literal(false),
      reason: v.union(
        v.literal('LOGO_TOO_LARGE'),
        v.literal('LOGO_TYPE'),
        v.literal('LOGO_MISSING'),
      ),
    }),
  ),
  handler: async (
    ctx,
    { orgId, fileId },
  ): Promise<
    | { ok: true }
    | { ok: false; reason: 'LOGO_TOO_LARGE' | 'LOGO_TYPE' | 'LOGO_MISSING' }
  > => {
    await ctx.runQuery(internal.orgAdmin.assertOwnerForAction, { orgId });
    const blob = await ctx.storage.get(fileId);
    if (!blob) return { ok: false, reason: 'LOGO_MISSING' };
    if (blob.size === 0 || blob.size > LOGO_MAX_BYTES) {
      await ctx.runMutation(internal.orgAdmin.discardFile, { fileId });
      return { ok: false, reason: 'LOGO_TOO_LARGE' };
    }
    const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    const type = sniffImageType(head);
    if (!type) {
      await ctx.runMutation(internal.orgAdmin.discardFile, { fileId });
      return { ok: false, reason: 'LOGO_TYPE' };
    }
    await ctx.runMutation(internal.orgAdmin.registerLogoUpload, {
      orgId,
      fileId,
      contentType: type,
    });
    return { ok: true };
  },
});

// --- Fiche : révision ----------------------------------------------------------

function validateRevision(fields: {
  name: string;
  description?: string;
  websiteUrl?: string;
  country: string;
  region: string;
  themes: string[];
  languages: string[];
  showMembers: boolean;
}) {
  const name = fields.name.trim();
  if (name.length < 2 || name.length > FIELD_MAX.name) {
    throw new ConvexError('INVALID_NAME');
  }
  const description = fields.description?.trim() || undefined;
  if (description && description.length > FIELD_MAX.body) {
    throw new ConvexError('INVALID_DESCRIPTION');
  }
  const checked = validateDirectoryFields({
    countryCode: fields.country,
    region: fields.region,
    themes: fields.themes,
    languages: fields.languages,
    description,
    websiteUrl: fields.websiteUrl,
  });
  if (!checked.ok) throw new ConvexError(checked.reason);
  if (checked.value.languages.length > 10 || checked.value.themes.length > 10) {
    throw new ConvexError('INVALID_THEMES');
  }
  return {
    name,
    ...(description ? { description } : {}),
    ...(checked.value.websiteUrl
      ? { websiteUrl: checked.value.websiteUrl }
      : {}),
    country: checked.value.countryCode,
    region: checked.value.region,
    themes: checked.value.themes,
    languages: checked.value.languages,
    showMembers: fields.showMembers,
  };
}

export const submitRevision = mutation({
  args: {
    orgId: v.id('organizations'),
    fields: organizationRevisionFields,
    logoFileId: v.optional(v.id('_storage')),
    removeLogo: v.optional(v.boolean()),
  },
  returns: v.id('organizationRevisions'),
  handler: async (ctx, args) => {
    const { user, org } = await requireOrgOwner(ctx, args.orgId);
    await enforceRateLimit(ctx, {
      key: `orgRevision:${user._id}`,
      ...REVISION_LIMIT,
    });
    const fields = validateRevision(args.fields);
    // Le logo doit venir d'un téléversement VÉRIFIÉ pour cette organisation
    // (`attachLogo`) : un identifiant de stockage quelconque est refusé.
    if (args.logoFileId) {
      const upload = await ctx.db
        .query('organizationLogoUploads')
        .withIndex('by_file', (q) => q.eq('fileId', args.logoFileId!))
        .first();
      if (!upload || upload.orgId !== org._id) {
        throw new ConvexError('INVALID_LOGO');
      }
    }
    // Une seule révision en attente par organisation : la nouvelle remplace
    // l'ancienne, que le modérateur n'a plus à lire.
    const previous = await ctx.db
      .query('organizationRevisions')
      .withIndex('by_org_and_status', (q) =>
        q.eq('orgId', org._id).eq('status', 'pending'),
      )
      .take(5);
    for (const p of previous) {
      await ctx.db.patch(p._id, { status: 'superseded' });
      if (p.logoFileId && p.logoFileId !== args.logoFileId) {
        await ctx.storage.delete(p.logoFileId);
      }
    }
    const id = await ctx.db.insert('organizationRevisions', {
      orgId: org._id,
      submittedBy: user._id,
      status: 'pending',
      fields,
      ...(args.logoFileId ? { logoFileId: args.logoFileId } : {}),
      ...(args.removeLogo && !args.logoFileId ? { removeLogo: true } : {}),
      submittedAt: Date.now(),
    });
    await recordAudit(ctx, {
      actorId: user._id,
      action: AUDIT.ORG_REVISION_SUBMITTED,
      targetId: org._id,
      metadata: { revisionId: id },
    });
    return id;
  },
});

// --- Modération des révisions -------------------------------------------------

export const listPendingRevisions = query({
  args: {},
  returns: v.array(
    v.object({
      revision: revisionView,
      org: v.object({
        _id: v.id('organizations'),
        name: v.string(),
        slug: v.string(),
        status: v.union(
          v.literal('active'),
          v.literal('pending'),
          v.literal('suspended'),
        ),
        country: v.string(),
        region: v.string(),
        themes: v.array(v.string()),
        languages: v.array(v.string()),
        description: v.union(v.string(), v.null()),
        websiteUrl: v.union(v.string(), v.null()),
        showMembers: v.boolean(),
        logoUrl: v.union(v.string(), v.null()),
      }),
      submitterEmail: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'moderateur');
    const pending = await ctx.db
      .query('organizationRevisions')
      .withIndex('by_status', (q) => q.eq('status', 'pending'))
      .take(100);
    const out = [];
    for (const r of pending) {
      const org = await ctx.db.get(r.orgId);
      if (!org) continue;
      const submitter = await ctx.db.get(r.submittedBy);
      out.push({
        revision: await projectRevision(ctx, r),
        org: {
          _id: org._id,
          name: org.name,
          slug: org.slug,
          status: org.status,
          country: org.country,
          region: org.region,
          themes: org.themes,
          languages: org.languages,
          description: org.description ?? null,
          websiteUrl: org.websiteUrl ?? null,
          showMembers: org.showMembers ?? false,
          logoUrl: await logoUrl(ctx, org.logoFileId),
        },
        submitterEmail: submitter?.email ?? null,
      });
    }
    return out;
  },
});

export const reviewRevision = mutation({
  args: {
    revisionId: v.id('organizationRevisions'),
    decision: v.union(v.literal('approved'), v.literal('rejected')),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { revisionId, decision, notes }) => {
    const reviewer = await requireNetworkRole(ctx, 'moderateur');
    const revision = await ctx.db.get(revisionId);
    if (!revision) throw new ConvexError('NOT_FOUND');
    if (revision.status !== 'pending')
      throw new ConvexError('ALREADY_REVIEWED');
    const org = await ctx.db.get(revision.orgId);
    if (!org) throw new ConvexError('NOT_FOUND');
    const note = notes?.trim() || undefined;
    if (note && note.length > FIELD_MAX.body) {
      throw new ConvexError('INVALID_COMMENT');
    }
    const now = Date.now();
    await ctx.db.patch(revisionId, {
      status: decision,
      reviewedBy: reviewer._id,
      reviewedAt: now,
      ...(note ? { reviewNotes: note } : {}),
    });

    if (decision === 'approved') {
      const f = revision.fields;
      let logoFileId = org.logoFileId;
      if (revision.logoFileId) {
        if (org.logoFileId) await ctx.storage.delete(org.logoFileId);
        logoFileId = revision.logoFileId;
      } else if (revision.removeLogo && org.logoFileId) {
        await ctx.storage.delete(org.logoFileId);
        logoFileId = undefined;
      }
      // Fiche « à compléter » (créée sans champs d'annuaire) : sa première
      // révision validée la publie. Une fiche SUSPENDUE le reste.
      const status = org.status === 'pending' ? 'active' : org.status;
      await ctx.db.patch(org._id, {
        name: f.name,
        description: f.description,
        websiteUrl: f.websiteUrl,
        country: f.country,
        region: f.region,
        themes: f.themes,
        languages: f.languages,
        showMembers: f.showMembers,
        logoFileId,
        status,
        updatedAt: now,
      });
      await trackOrganizationStatus(ctx, org.status, status);
    } else if (revision.logoFileId) {
      await ctx.storage.delete(revision.logoFileId);
    }

    await notify(ctx, {
      userId: revision.submittedBy,
      type:
        decision === 'approved'
          ? 'org_revision_approved'
          : 'org_revision_rejected',
      titleKey:
        decision === 'approved' ? 'orgRevisionApproved' : 'orgRevisionRejected',
      params: { org: org.name },
      link: '/espace-membre/organisation',
    });
    await recordAudit(ctx, {
      actorId: reviewer._id,
      action: AUDIT.ORG_REVISION_REVIEWED,
      targetId: org._id,
      metadata: { revisionId, decision },
    });
    return null;
  },
});

// --- Fiche publique : logo, publications, membres ----------------------------

const PUBLIC_PUBLICATIONS_MAX = 50;

// Complément de la fiche publique `/le-reseau/<slug>` (F-21). Séparé de
// `organizations.getBySlug`, dont la forme est partagée avec l'annuaire :
// cette query ne sert que la fiche détaillée. Même règle de statut : une
// organisation non active est indistinguable d'une organisation absente.
export const publicDetails = query({
  args: { slug: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      logoUrl: v.union(v.string(), v.null()),
      publications: v.array(
        v.object({
          title: v.string(),
          slug: v.string(),
          type: v.string(),
          year: v.number(),
        }),
      ),
      // `null` : l'organisation n'a pas choisi de montrer ses membres.
      members: v.union(v.null(), v.array(v.object({ name: v.string() }))),
    }),
  ),
  handler: async (ctx, { slug }) => {
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (!org || org.status !== 'active') return null;
    const pubs = await ctx.db
      .query('publications')
      .withIndex('by_organization_and_status', (q) =>
        q.eq('organizationId', org._id).eq('status', 'published'),
      )
      .order('desc')
      .take(PUBLIC_PUBLICATIONS_MAX);
    let members: { name: string }[] | null = null;
    if (org.showMembers) {
      // Seuls les comptes qui portent un NOM apparaissent : jamais une
      // adresse e-mail, et un compte suspendu disparaît de la page.
      const rows = await ctx.db
        .query('organizationMemberships')
        .withIndex('by_org', (q) => q.eq('orgId', org._id))
        .take(MAX_MEMBERS_PER_ORG);
      members = [];
      for (const r of rows) {
        const u = await ctx.db.get(r.userId);
        if (u?.name && u.suspendedAt === undefined) {
          members.push({ name: u.name });
        }
      }
    }
    return {
      logoUrl: await logoUrl(ctx, org.logoFileId),
      publications: pubs.map((p) => ({
        title: p.title,
        slug: p.slug,
        type: p.type,
        year: p.year,
      })),
      members,
    };
  },
});

// --- Back-office --------------------------------------------------------------

// Liste des organisations pour le formulaire de création de compte.
export const listForAdmin = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('organizations'),
      name: v.string(),
      status: v.union(
        v.literal('active'),
        v.literal('pending'),
        v.literal('suspended'),
      ),
    }),
  ),
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'admin');
    const rows = await ctx.db.query('organizations').take(500);
    return rows
      .map((o) => ({ _id: o._id, name: o.name, status: o.status }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

// Reprise des publications déposées AVANT le rattachement automatique : leur
// organisation est déduite du rattachement actuel de l'auteur. Par lots, à
// lancer une fois après le déploiement (docs/backlog/comptes.md).
export const backfillPublicationOrganizations = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.object({ updated: v.number(), done: v.boolean() }),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query('publications')
      .paginate({ numItems: 100, cursor: cursor ?? null });
    let updated = 0;
    for (const p of page.page) {
      if (p.organizationId || !p.authorUserId) continue;
      const m = await ctx.db
        .query('organizationMemberships')
        .withIndex('by_user', (q) => q.eq('userId', p.authorUserId!))
        .first();
      if (m) {
        await ctx.db.patch(p._id, { organizationId: m.orgId });
        updated++;
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.orgAdmin.backfillPublicationOrganizations,
        { cursor: page.continueCursor },
      );
    }
    return { updated, done: page.isDone };
  },
});
