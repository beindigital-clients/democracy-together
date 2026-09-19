import { Password } from '@convex-dev/auth/providers/Password';
import { convexAuth } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';
import { emailVerification, passwordReset, emailOtpSignIn } from './otp';
import {
  MAX_FAILED_SIGN_IN_ATTEMPTS_PER_HOUR,
  validatePasswordRequirements,
} from './lib/passwordPolicy';

// Authentification (F-01) : e-mail+mot de passe (vérif/reset par code) et
// connexion sans mot de passe par code.
//
// PAS d'auto-inscription publique : un e-mail inconnu ne crée AUCUN compte
// (→ demande d'adhésion). Les comptes existants se connectent normalement, par
// mot de passe OU par code. La page d'inscription est redirigée vers /adhesion.
export const { auth, signIn, signOut, store } = convexAuth({
  providers: [
    Password({
      verify: emailVerification,
      reset: passwordReset,
      // Politique de mot de passe ÉCRITE (sécurité, constat M4) : 12 caractères
      // minimum et refus des mots de passe les plus courants, au lieu des 8
      // caractères que Convex Auth appliquerait en silence. Les valeurs et ce
      // qui les justifie : convex/lib/passwordPolicy.ts.
      validatePasswordRequirements,
    }),
    emailOtpSignIn,
  ],
  signIn: {
    // 5 échecs par heure et par compte, au lieu des 10 par défaut de la
    // bibliothèque. Ce n'est pas un verrouillage (le crédit se reconstitue :
    // un essai de plus toutes les 12 minutes) et le chemin « connexion par
    // code » a son propre compteur — même justification détaillée que
    // ci-dessus, dans convex/lib/passwordPolicy.ts.
    maxFailedAttempsPerHour: MAX_FAILED_SIGN_IN_ATTEMPTS_PER_HOUR,
  },
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      // Compte déjà identifié : connexion normale, inchangée.
      if (args.existingUserId) return args.existingUserId;
      // Nouvel identifiant : accepté uniquement si un compte existe déjà pour cet
      // e-mail (on relie alors le nouveau moyen de connexion) ; sinon refus.
      // ctx générique ici (pas d'index custom) → collect()+find() par e-mail.
      const email = args.profile.email;
      const existing = email
        ? (await ctx.db.query('users').collect()).find((u) => u.email === email)
        : undefined;
      if (existing) return existing._id;
      throw new ConvexError('NO_SELF_SIGNUP');
    },
  },
});
