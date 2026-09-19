import { Password } from '@convex-dev/auth/providers/Password';
import { convexAuth } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';
import { emailVerification, passwordReset, emailOtpSignIn } from './otp';

// Authentification (F-01) : e-mail+mot de passe (vérif/reset par code) et
// connexion sans mot de passe par code.
//
// PAS d'auto-inscription publique : un e-mail inconnu ne crée AUCUN compte
// (→ demande d'adhésion). Les comptes existants se connectent normalement, par
// mot de passe OU par code. La page d'inscription est redirigée vers /adhesion.
// `isAuthenticated` est OBLIGATOIRE depuis convex-auth 0.0.76 (le dépôt est en
// 0.0.94) : c'est la fonction que `convexAuthNextjsMiddleware` appelle sur le
// déploiement à CHAQUE requête vers une route protégée (cf. src/proxy.ts). Sans
// elle, le déploiement répond « could not find api.auth.isAuthenticated », le
// middleware lève, et TOUTE page authentifiée rend une erreur 500 — l'espace
// membre comme le back-office. Le défaut ne se voit jamais déconnecté, ce qui
// explique qu'il ait survécu : il a fallu qu'une session existe pour le révéler
// (issue #66, découvert par le journal du serveur en CI).
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
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
