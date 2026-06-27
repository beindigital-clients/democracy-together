import { Password } from '@convex-dev/auth/providers/Password';
import { convexAuth } from '@convex-dev/auth/server';
import { emailVerification, passwordReset, emailOtpSignIn } from './otp';

// Authentification complète (F-01) :
// - e-mail + mot de passe, avec vérification d'e-mail (OTP) à l'inscription
//   et réinitialisation du mot de passe par code ;
// - connexion sans mot de passe par code à usage unique (mobile/Afrique).
export const { auth, signIn, signOut, store } = convexAuth({
  providers: [
    Password({ verify: emailVerification, reset: passwordReset }),
    emailOtpSignIn,
  ],
});
