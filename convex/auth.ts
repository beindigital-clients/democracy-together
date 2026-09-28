import { Password } from '@convex-dev/auth/providers/Password';
import { convexAuth } from '@convex-dev/auth/server';
import { emailVerification, passwordReset, emailOtpSignIn } from './otp';
import {
  MAX_FAILED_SIGN_IN_ATTEMPTS_PER_HOUR,
  validatePasswordRequirements,
} from './lib/passwordPolicy';
import { assertMaySignIn, resolveSignInUserId } from './lib/signIn';

// Authentication (F-01): email+password (verification/reset by code) and
// passwordless sign-in by code.
//
// NO public self-signup: an unknown email creates NO account
// (→ membership application). Existing accounts sign in normally, by
// password OR by code. The sign-up page redirects to /adhesion.
//
// `isAuthenticated` is MANDATORY since convex-auth 0.0.76 (the repo is on
// 0.0.94): it is the function `convexAuthNextjsMiddleware` calls on the
// deployment on EVERY request to a protected route (see src/proxy.ts). Without
// it, the deployment responds "could not find api.auth.isAuthenticated", the
// middleware throws, and EVERY authenticated page returns a 500 error — the member
// area as well as the back office. The defect never shows when signed out, which
// explains why it survived: it took a session existing to reveal it
// (issue #66, discovered through the server log in CI).
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      verify: emailVerification,
      reset: passwordReset,
      // WRITTEN password policy (security, finding M4): 12 characters
      // minimum and rejection of the most common passwords, instead of the 8
      // characters Convex Auth would silently enforce. The values and what
      // justifies them: convex/lib/passwordPolicy.ts.
      validatePasswordRequirements,
    }),
    emailOtpSignIn,
  ],
  signIn: {
    // 5 failures per hour per account, instead of the library's default
    // 10. This is not a lockout (the credit replenishes:
    // one more attempt every 12 minutes) and the "sign-in by
    // code" path has its own counter — same detailed justification as
    // above, in convex/lib/passwordPolicy.ts.
    maxFailedAttempsPerHour: MAX_FAILED_SIGN_IN_ATTEMPTS_PER_HOUR,
  },
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      // Already-identified account: normal sign-in, unchanged.
      if (args.existingUserId) return args.existingUserId;
      // New identifier: accepted only if an account already exists for this
      // email (we then link the new sign-in method); otherwise refused.
      //
      // Convex Auth types this ctx as `AnyDataModel`: a generic model without
      // any application index, hence the scan of `users` that lived here. Passing
      // `ctx.db` to a function that expects it typed on the project's `DataModel`
      // is enough to get the `email` index back — without a cast (see lib/signIn.ts, which
      // carries the decision, the details and the tests: auth.ts is excluded from the
      // test glob, see TESTING.md).
      return await resolveSignInUserId(ctx.db, args.profile.email);
    },
    // A SUSPENDED account can no longer open a session (accounts workstream).
    // The decision lives in lib/signIn.ts, testable: this file is excluded from the
    // test glob (see TESTING.md).
    async beforeSessionCreation(ctx, { userId }) {
      await assertMaySignIn(ctx.db, userId);
    },
  },
});
