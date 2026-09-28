import type { GenericDatabaseReader } from 'convex/server';
import { ConvexError } from 'convex/values';
import type { DataModel, Id } from '../_generated/dataModel';

// Platform entry decision (F-01) — the body of the `createOrUpdateUser`
// callback in convex/auth.ts, extracted here.
//
// This is the HOTTEST path in the backend: it runs on every sign-in attempt,
// and it is what enforces the "no self-registration" rule — an unknown e-mail
// creates no account, it is refused (NO_SELF_SIGNUP).
//
// Two reasons to move it out of auth.ts, as a function that receives `db`
// rather than a `ctx`:
//
// 1. INDEXED READ. Convex Auth types its callbacks' ctx as
//    `GenericMutationCtx<AnyDataModel>`: a generic model that only declares
//    SYSTEM indexes (`by_id`, `by_creation_time`). `withIndex('email')` did
//    not compile there — hence the original `collect()+find()`, which read
//    the ENTIRE `users` table on every sign-in. The gap was purely STATIC:
//    the `email` index does exist (see schema.ts) and Convex resolves it by
//    NAME, at runtime, against the deployed schema. So it is enough to take
//    `db` here, typed on the project's `DataModel`, for the index to become
//    visible to the compiler again — without a cast, because the library's
//    generic model is assignable to this one, and without changing anything
//    at runtime. The typing is not decorative: renaming the index in
//    schema.ts now breaks `pnpm typecheck:convex`. The same read already
//    runs elsewhere (`devAdmin.setRoleByEmail`, `users.inviteUser`).
//
// 2. TESTS. auth.ts touches `process.env` on load: it is excluded from the
//    `import.meta.glob` glob of every test file (see TESTING.md). The
//    decision guarding entry to the platform was therefore covered by
//    nothing; here, it is tested as is (convex/auth-callback.test.ts).

export async function resolveSignInUserId(
  db: GenericDatabaseReader<DataModel>,
  email: string | undefined,
): Promise<Id<'users'>> {
  // EXACT equality on the address, like the `find()` it replaces: we do not
  // normalise here, that would widen what the callback accepts. Accounts are
  // created with an already normalised address — invitation (F-63),
  // membership approval (F-22) and admin bootstrap all go through
  // `normalizeEmail()`, precisely so that this read finds them.
  //
  // `.first()` and not `.unique()`: if two rows shared an address, the old
  // `find()` returned the oldest; the index, which orders ties by
  // `_creationTime`, returns the same one. A refusal must not turn into a read
  // error.
  const existing = email
    ? await db
        .query('users')
        .withIndex('email', (q) => q.eq('email', email))
        .first()
    : null;
  if (existing) return existing._id;
  throw new ConvexError('NO_SELF_SIGNUP');
}

// SUSPENSION AT SIGN-IN (accounts workstream, F-63).
//
// Called by the `beforeSessionCreation` callback in convex/auth.ts, hence on
// ALL paths that open a session — password, e-mail code, address
// verification — and AFTER the secret has been verified: refusing here
// reveals nothing about an account's existence to someone who does not know
// its password or code.
//
// Sessions already open at the time of suspension are deleted by
// `accounts.suspendAccount`; this guard prevents opening a new one.
// The `ACCOUNT_SUSPENDED` code passes through `/api/auth` in the error
// message: the sign-in screen recognises it and shows a clear message
// (src/lib/auth-errors.ts).
export async function assertMaySignIn(
  db: GenericDatabaseReader<DataModel>,
  userId: Id<'users'>,
): Promise<void> {
  const user = await db.get(userId);
  if (user && user.suspendedAt !== undefined) {
    throw new ConvexError('ACCOUNT_SUSPENDED');
  }
}
