import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { normalizeEmail } from './lib/onboarding';
import { isEmail } from './lib/validation';

// Amorçage de l'administrateur initial (issue #47).
//
// Le problème : sur un déploiement neuf, AUCUN chemin de production ne créait le
// premier administrateur. `users.setRole` et `users.inviteUser` exigent un admin
// déjà connecté, `organizations.reviewApplication` n'accorde que « membre », et
// `devAdmin.setRoleByEmail` est gardé par AUTH_DEV_OTP — un drapeau qui n'est
// pas isolé : il ouvre TOUTE la surface de développement (codes OTP écrits en
// clair dans `devOtpCodes` et relus par un oracle, seeds de démonstration,
// sept oracles de lecture, envoi d'e-mail qui journalise au lieu d'échouer).
// L'activer, même quelques minutes en production, annulerait la fermeture de
// ces oracles (PR #4, P0-4).
//
// Cette mutation est donc le chemin d'amorçage de PRODUCTION. Ce qui l'empêche
// de devenir une porte dérobée permanente :
//
//  1. `internalMutation` : hors API publique — invocable depuis le serveur ou la
//     CLI (`npx convex run`), jamais par un client.
//  2. Garde BOOTSTRAP_ADMIN_EMAIL : sa PROPRE variable d'environnement,
//     indépendante d'AUTH_DEV_OTP, donc l'amorçage n'ouvre aucune autre
//     surface. L'adresse passée en argument doit lui correspondre : la variable
//     dit qui le déploiement autorise, l'argument dit qui l'opérateur visait.
//     Une faute de frappe est rejetée au lieu de promouvoir un tiers.
//  3. Garde « zéro admin » : dès qu'un administrateur existe, la mutation est
//     inopérante. Elle ne sert donc qu'une fois, sur un déploiement neuf. C'est
//     cette garde — et non le retrait de la variable — qui referme la porte :
//     la variable peut être retirée juste après l'amorçage, et même laissée par
//     négligence elle ne rouvre rien.
//
// Le rôle n'est pas un paramètre : cette fonction ne sait accorder que
// « admin ». Toute autre attribution passe par `users.setRole`, auditée et
// réservée aux administrateurs.
//
// Procédure documentée dans docs/deploiement.md.
export const bootstrapAdmin = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    // --- Garde 1 : le déploiement doit désigner explicitement l'adresse ------
    const configured = process.env.BOOTSTRAP_ADMIN_EMAIL;
    if (!configured) {
      throw new Error(
        'BOOTSTRAP_ADMIN_NOT_CONFIGURED : définir BOOTSTRAP_ADMIN_EMAIL sur le déploiement Convex (npx convex env set BOOTSTRAP_ADMIN_EMAIL …).',
      );
    }
    // Normalisation identique à celle de la candidature et de la connexion
    // (minuscules, sans espaces) : sinon le compte créé ici ne serait jamais
    // retrouvé par le callback `createOrUpdateUser` de convex/auth.ts, et la
    // comparaison ci-dessous échouerait sur une simple différence de casse.
    const normalized = normalizeEmail(email);
    if (!isEmail(normalized)) throw new Error('INVALID_EMAIL');
    if (normalized !== normalizeEmail(configured)) {
      throw new Error(
        "BOOTSTRAP_EMAIL_MISMATCH : l'adresse demandée ne correspond pas à BOOTSTRAP_ADMIN_EMAIL.",
      );
    }

    // --- Garde 2 : non rejouable ---------------------------------------------
    // Un seul administrateur suffit à refermer la porte définitivement.
    const existingAdmin = await ctx.db
      .query('users')
      .withIndex('by_role', (q) => q.eq('role', 'admin'))
      .first();
    if (existingAdmin) {
      throw new Error(
        'BOOTSTRAP_ALREADY_DONE : un administrateur existe déjà — passer par le back-office (users.setRole).',
      );
    }

    // UPSERT, pour la même raison que `devAdmin.setRoleByEmail` : depuis la
    // suppression de l'auto-inscription, aucun chemin ne crée de compte sur un
    // déploiement neuf, donc un simple `patch` échouerait sur « Utilisateur
    // introuvable ». Créer la ligne `users` suffit à rendre le compte
    // connectable — la connexion par code à usage unique fait le reste, sans
    // qu'aucun code ne soit jamais stocké en base (voir convex/otp.ts).
    const existing = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', normalized))
      .first();

    let userId: Id<'users'>;
    let created: boolean;
    if (existing) {
      await ctx.db.patch(existing._id, { role: 'admin' });
      userId = existing._id;
      created = false;
    } else {
      userId = await ctx.db.insert('users', {
        email: normalized,
        role: 'admin',
      });
      created = true;
    }

    // Audit (F-67), comme `users.setRole`. Pas d'`actorId` : l'opération vient
    // de la CLI d'exploitation, pas d'un compte de la plateforme — désigner le
    // nouvel administrateur comme auteur laisserait croire qu'il s'est promu
    // lui-même. `via` garde la trace du chemin emprunté.
    await recordAudit(ctx, {
      action: AUDIT.ADMIN_BOOTSTRAPPED,
      targetId: userId,
      metadata: { email: normalized, role: 'admin', created, via: 'bootstrap' },
    });

    return { ok: true as const, userId, created, email: normalized };
  },
});
