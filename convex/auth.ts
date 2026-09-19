import { Password } from '@convex-dev/auth/providers/Password';
import { convexAuth } from '@convex-dev/auth/server';
import { emailVerification, passwordReset, emailOtpSignIn } from './otp';
import { resolveSignInUserId } from './lib/signIn';

// Authentification (F-01) : e-mail+mot de passe (vérif/reset par code) et
// connexion sans mot de passe par code.
//
// PAS d'auto-inscription publique : un e-mail inconnu ne crée AUCUN compte
// (→ demande d'adhésion). Les comptes existants se connectent normalement, par
// mot de passe OU par code. La page d'inscription est redirigée vers /adhesion.
export const { auth, signIn, signOut, store } = convexAuth({
  providers: [
    Password({ verify: emailVerification, reset: passwordReset }),
    emailOtpSignIn,
  ],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      // Compte déjà identifié : connexion normale, inchangée.
      if (args.existingUserId) return args.existingUserId;
      // Nouvel identifiant : accepté uniquement si un compte existe déjà pour cet
      // e-mail (on relie alors le nouveau moyen de connexion) ; sinon refus.
      //
      // Convex Auth type ce ctx sur `AnyDataModel` : un modèle générique sans
      // aucun index applicatif, d'où le scan de `users` qui vivait ici. Passer
      // `ctx.db` à une fonction qui l'attend typé sur le `DataModel` du projet
      // suffit à retrouver l'index `email` — sans cast (cf. lib/signIn.ts, qui
      // porte la décision, le détail et les tests : auth.ts est exclu du glob
      // des tests, cf. TESTING.md).
      return await resolveSignInUserId(ctx.db, args.profile.email);
    },
  },
});
