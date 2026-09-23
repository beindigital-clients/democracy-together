import { v } from 'convex/values';
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { getAuthUserId } from '@convex-dev/auth/server';
import { enforceRecaptcha } from './lib/recaptcha';
import { requireNetworkRole, rank } from './lib/rbac';
import { recordAudit } from './lib/audit';
import {
  COUNTER,
  bumpCounter,
  trackMembershipApplicationStatus,
  trackOrganizationStatus,
} from './lib/counters';
import { AUDIT } from './lib/auditActions';
import { notify } from './lib/notify';
import {
  matchesFilters,
  computeFacets,
  directoryRegionValidator,
  directoryThemeValidator,
  directoryFacetsValidator,
  projectOrganization,
  publicOrganizationValidator,
} from './lib/directory';
import { isEmail, FIELD_MAX } from './lib/validation';
import {
  enforcePublicFormLimit,
  enforceRateLimit,
  RATE_LIMITS,
} from './lib/rateLimit';
import { slugify } from './lib/slug';
import { sendEmail } from './email';
import {
  normalizeEmail,
  validateDirectoryFields,
  invitationEmail,
} from './lib/onboarding';

// Annuaire public des think tanks (F-19) : liste filtrée + facettes calculées
// sur l'ensemble des membres actifs (pour ne proposer que des filtres utiles).
// Rendu côté serveur, filtres dans l'URL -> SEO + faible débit (F-05/F-07).
export const listDirectory = query({
  args: {
    // `region` et `theme` sont des domaines FERMÉS (cf. lib/directory) ; seul
    // `q`, recherche plein texte, est du texte libre. L'appelant
    // (src/app/[locale]/le-reseau/page.tsx) assainit les paramètres d'URL en
    // amont : un `?region=` fantaisiste vaut « pas de filtre », et non une
    // erreur d'argument sur une page publique.
    region: v.optional(directoryRegionValidator),
    theme: v.optional(directoryThemeValidator),
    q: v.optional(v.string()),
  },
  returns: v.object({
    items: v.array(publicOrganizationValidator),
    facets: directoryFacetsValidator,
    total: v.number(),
  }),
  handler: async (ctx, { region, theme, q }) => {
    const active = await ctx.db
      .query('organizations')
      .withIndex('by_status', (qi) => qi.eq('status', 'active'))
      .collect();
    const items = active
      .filter((o) => matchesFilters(o, { region, theme, q }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(projectOrganization);
    return { items, facets: computeFacets(active), total: active.length };
  },
});

// Fiche membre (F-21) — publique : ne renvoie QUE les organisations actives.
// Le filtrage de statut vit dans la query (et non chez l'appelant) pour qu'aucun
// consommateur ne puisse exposer une fiche pending/suspended.
export const getBySlug = query({
  args: { slug: v.string() },
  returns: v.union(publicOrganizationValidator, v.null()),
  handler: async (ctx, { slug }) => {
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    // Le filtre de statut reste ici, et `status` ne sort plus : une fiche
    // pending/suspended est indistinguable d'une fiche inexistante.
    return org && org.status === 'active' ? projectOrganization(org) : null;
  },
});

// Candidature d'adhésion (F-22) — ouverte au public ; on lie l'utilisateur
// connecté. Valide côté serveur (défense en profondeur, l'UI valide aussi).
//
// Portail anti-spam : l'action vérifie reCAPTCHA v3 puis délègue à
// `storeApplication` (internalMutation). L'identité de l'utilisateur connecté
// est propagée à travers ctx.runMutation -> la liaison applicantUserId tient.
export const submitApplication = action({
  args: {
    type: v.union(v.literal('organisation'), v.literal('individu')),
    organizationName: v.string(),
    contactEmail: v.string(),
    country: v.string(),
    message: v.optional(v.string()),
    captchaToken: v.optional(v.string()),
  },
  handler: async (ctx, { captchaToken, ...input }) => {
    await enforceRecaptcha(captchaToken, 'membership');
    // Annotation explicite : casse la circularité de type TS (cf. guidelines).
    const id: Id<'membershipApplications'> = await ctx.runMutation(
      internal.organizations.storeApplication,
      input,
    );
    return id;
  },
});

export const storeApplication = internalMutation({
  args: {
    type: v.union(v.literal('organisation'), v.literal('individu')),
    organizationName: v.string(),
    contactEmail: v.string(),
    country: v.string(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const organizationName = args.organizationName.trim();
    const contactEmail = args.contactEmail.trim();
    const country = args.country.trim();
    const message = args.message?.trim() || undefined;

    // Bornes HAUTES autant que basses (pentest M-2, « remplissage ») : ce
    // formulaire est anonyme et n'en avait aucune.
    if (
      organizationName.length < 2 ||
      organizationName.length > FIELD_MAX.name
    ) {
      throw new Error('INVALID_NAME');
    }
    if (!isEmail(contactEmail)) throw new Error('INVALID_EMAIL');
    if (country.length < 2 || country.length > FIELD_MAX.country) {
      throw new Error('INVALID_COUNTRY');
    }
    if (message !== undefined && message.length > FIELD_MAX.body) {
      throw new Error('INVALID_MESSAGE');
    }

    // Plafonds NON FORGEABLES (audit M2) — par IP et global par formulaire :
    // changer d'adresse ne rend plus un quota neuf. Cf. lib/rateLimit.ts.
    await enforcePublicFormLimit(ctx, 'apply');

    await enforceRateLimit(ctx, {
      key: `apply:${contactEmail.toLowerCase()}`,
      ...RATE_LIMITS.apply,
    });

    const userId = await getAuthUserId(ctx);
    const applicationId = await ctx.db.insert('membershipApplications', {
      type: args.type,
      organizationName,
      contactEmail,
      country,
      message,
      status: 'pending',
      submittedAt: Date.now(),
      ...(userId ? { applicantUserId: userId } : {}),
    });
    await trackMembershipApplicationStatus(ctx, null, 'pending');
    return applicationId;
  },
});

// DEV/TEST seulement (garde AUTH_DEV_OTP) : relit la dernière candidature d'une
// adresse, pour que l'E2E vérifie le stockage réel (cf. otp.latestDevCode).
export const latestApplicationForEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') return null;
    const all = await ctx.db
      .query('membershipApplications')
      .order('desc')
      .collect();
    const a = all.find((x) => x.contactEmail === email);
    return a
      ? {
          organizationName: a.organizationName,
          type: a.type,
          status: a.status,
          country: a.country,
        }
      : null;
  },
});

// Validation d'une candidature (F-22 / F-26) — modérateur et au-dessus, audité.
//
// C'est ici que se jouait le blocage n°1 de l'audit : l'approbation se
// contentait d'élever le rôle d'un compte DÉJÀ existant. Depuis la suppression
// de l'auto-inscription, un candidat qui n'avait jamais créé de compte ne
// pouvait donc jamais se connecter (la connexion refuse un e-mail inconnu), et
// aucune organisation n'entrait dans l'annuaire. L'approbation crée désormais
// les trois objets manquants : le COMPTE, l'ORGANISATION et le RATTACHEMENT.
export const reviewApplication = mutation({
  args: {
    applicationId: v.id('membershipApplications'),
    decision: v.union(v.literal('approved'), v.literal('rejected')),
    notes: v.optional(v.string()),
    // Champs d'annuaire saisis par le modérateur (F-19). La candidature ne
    // collecte qu'un pays en texte libre ; sans ces champs, la fiche serait
    // publiée avec une région et des thématiques inventées. Absents -> la fiche
    // est créée en 'pending' et reste hors de l'annuaire public, mais le compte
    // est créé quand même : le membre peut se connecter immédiatement.
    directory: v.optional(
      v.object({
        countryCode: v.string(),
        region: v.string(),
        themes: v.array(v.string()),
        languages: v.array(v.string()),
        description: v.optional(v.string()),
        websiteUrl: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { applicationId, decision, notes, directory }) => {
    const reviewer = await requireNetworkRole(ctx, 'moderateur');
    const application = await ctx.db.get(applicationId);
    if (!application) throw new Error('NOT_FOUND');
    // Machine à états (audit M6) : une candidature déjà tranchée ne se rejoue
    // pas. Sans cela, ré-approuver créait des doublons de compte et de fiche, et
    // « rejeter » après approbation laissait le rôle accordé en place.
    if (application.status !== 'pending') throw new Error('ALREADY_REVIEWED');

    const now = Date.now();
    await ctx.db.patch(applicationId, {
      status: decision,
      reviewedBy: reviewer._id,
      reviewNotes: notes,
      reviewedAt: now,
    });
    await trackMembershipApplicationStatus(ctx, application.status, decision);

    if (decision === 'rejected') {
      if (application.applicantUserId) {
        await notify(ctx, {
          userId: application.applicantUserId,
          type: 'membership_rejected',
          titleKey: 'membershipRejected',
          link: '/adhesion',
        });
      }
      await recordAudit(ctx, {
        actorId: reviewer._id,
        action: AUDIT.MEMBERSHIP_REVIEWED,
        targetId: applicationId,
        metadata: { decision },
      });
      return { userCreated: false, organizationId: null };
    }

    // --- 1) Le COMPTE ---------------------------------------------------------
    // Normalisé exactement comme le fera la connexion, sinon le membre approuvé
    // ne retrouvera jamais son compte.
    const email = normalizeEmail(application.contactEmail);
    const linked = application.applicantUserId
      ? await ctx.db.get(application.applicantUserId)
      : null;
    const byEmail = linked
      ? null
      : await ctx.db
          .query('users')
          .withIndex('email', (q) => q.eq('email', email))
          .first();

    let user = linked ?? byEmail;
    let userCreated = false;
    if (!user) {
      const id = await ctx.db.insert('users', { email, role: 'membre' });
      await bumpCounter(ctx, COUNTER.USERS, 1);
      user = (await ctx.db.get(id))!;
      userCreated = true;
      await recordAudit(ctx, {
        actorId: reviewer._id,
        action: AUDIT.USER_INVITED,
        targetId: id,
        metadata: { via: 'membership', email },
      });
    } else if (rank(user.role) < rank('membre')) {
      // On n'écrase JAMAIS un rôle supérieur.
      await ctx.db.patch(user._id, { role: 'membre' });
      await recordAudit(ctx, {
        actorId: reviewer._id,
        action: AUDIT.USER_ROLE_CHANGED,
        targetId: user._id,
        metadata: { role: 'membre', via: 'membership' },
      });
    }

    // --- 2) L'ORGANISATION et 3) le RATTACHEMENT -----------------------------
    let organizationId: Id<'organizations'> | null = null;
    if (application.type === 'organisation') {
      const fields = directory ? validateDirectoryFields(directory) : null;
      if (fields && !fields.ok) throw new Error(fields.reason);
      const d = fields && fields.ok ? fields.value : null;

      // Slug unique (suffixe incrémental), comme pour les publications.
      const root = slugify(application.organizationName);
      let slug = root;
      let n = 2;
      while (
        await ctx.db
          .query('organizations')
          .withIndex('by_slug', (q) => q.eq('slug', slug))
          .first()
      ) {
        slug = `${root}-${n++}`;
      }

      organizationId = await ctx.db.insert('organizations', {
        name: application.organizationName,
        slug,
        // Sans champs d'annuaire, la fiche reste 'pending' : mieux vaut une
        // fiche à compléter qu'une fiche publique fausse.
        country: d?.countryCode ?? application.country,
        region: d?.region ?? '',
        languages: d?.languages ?? [],
        themes: d?.themes ?? [],
        ...(d?.description ? { description: d.description } : {}),
        ...(d?.websiteUrl ? { websiteUrl: d.websiteUrl } : {}),
        status: d ? 'active' : 'pending',
        createdAt: now,
      });
      await trackOrganizationStatus(ctx, null, d ? 'active' : 'pending');
      await ctx.db.insert('organizationMemberships', {
        userId: user._id,
        orgId: organizationId,
        orgRole: 'owner',
        createdAt: now,
      });
      await ctx.db.patch(applicationId, { createdOrgId: organizationId });
      await recordAudit(ctx, {
        actorId: reviewer._id,
        action: AUDIT.ORGANIZATION_CREATED,
        targetId: organizationId,
        metadata: { slug, status: d ? 'active' : 'pending' },
      });
    }

    await notify(ctx, {
      userId: user._id,
      type: 'membership_approved',
      titleKey: 'membershipApproved',
      link: '/espace-membre',
    });

    await recordAudit(ctx, {
      actorId: reviewer._id,
      action: AUDIT.MEMBERSHIP_REVIEWED,
      targetId: applicationId,
      metadata: { decision },
    });

    // L'e-mail part dans une ACTION planifiée (jamais de fetch en mutation).
    // Son échec ne remet pas en cause l'approbation : le compte existe déjà, et
    // l'invitation est renvoyable depuis le back-office.
    await ctx.scheduler.runAfter(
      0,
      internal.organizations.sendMembershipInvitation,
      { applicationId, email, organizationName: application.organizationName },
    );

    return { userCreated, organizationId };
  },
});

// Envoi de l'invitation à se connecter (action : appel réseau interdit en
// mutation). Marque `invitedAt` seulement si l'envoi a réussi, pour qu'un
// renvoi reste possible et visible côté back-office.
export const sendMembershipInvitation = internalAction({
  args: {
    applicationId: v.id('membershipApplications'),
    email: v.string(),
    organizationName: v.string(),
  },
  handler: async (ctx, { applicationId, email, organizationName }) => {
    const { subject, html } = invitationEmail({
      organizationName,
      siteUrl: process.env.SITE_URL ?? 'http://localhost:3000',
    });
    await sendEmail({ to: email, subject, html });
    await ctx.runMutation(internal.organizations.markInvited, {
      applicationId,
    });
  },
});

export const markInvited = internalMutation({
  args: { applicationId: v.id('membershipApplications') },
  handler: async (ctx, { applicationId }) => {
    await ctx.db.patch(applicationId, { invitedAt: Date.now() });
  },
});
