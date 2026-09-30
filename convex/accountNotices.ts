import { v } from 'convex/values';
import { internal } from './_generated/api';
import {
  internalAction,
  mutation,
  type MutationCtx,
} from './_generated/server';
import { sendEmail } from './email';
import {
  passwordlessAccountEmail,
  unknownAccountEmail,
  type NoticePurpose,
} from './lib/accountEmails';
import { locale } from './lib/locales';
import { normalizeEmail } from './lib/onboarding';
import { callerIpBucket, consumeRateLimit } from './lib/rateLimit';
import { EMAIL_MAX_LENGTH, isEmail } from './lib/validation';

// WHAT AN ADDRESS WITHOUT AN ACCOUNT IS TOLD (sign-in by code, forgot
// password).
//
// The code screens never say whether an account exists (anti-enumeration,
// campaign of 27/09): an unknown address reaches the code step exactly like a
// known one. That left its owner with no answer at all — the screen spoke of a
// code, and nothing ever came. The answer now goes where only that owner reads
// it: an e-mail, "no account for this address, here is how to join" — or, for
// a reset on an account that signs in by code, "this account has no password
// yet".
//
// The screen calls `requestNotice` when its own request failed; the server
// decides. The caller learns NOTHING: the mutation returns `null` whatever the
// address, never throws on a cap, and sends from a scheduled action, so
// neither the answer nor its timing depends on the account existing.

const purpose = v.union(v.literal('signin'), v.literal('reset'));
const noticeKind = v.union(v.literal('noAccount'), v.literal('noPassword'));

const HOUR = 60 * 60 * 1000;

// A notice answers one question; repeating it adds nothing. Per address,
// three a day. Per IP block and globally, the caps an attacker cannot dodge by
// changing address — the same two guards as the public forms.
export const NOTICE_LIMITS = {
  perAddress: { max: 3, windowMs: 24 * HOUR },
  perIp: { max: 20, windowMs: HOUR },
  global: { max: 200, windowMs: HOUR },
} as const;

// Domains reserved by RFC 2606 and RFC 6761: no mailbox behind them. The E2E
// and the production smoke tests use them; a notice there would only bounce
// and hurt the sender's reputation.
function isReservedAddress(email: string): boolean {
  const domain = email.slice(email.lastIndexOf('@') + 1);
  return (
    /(^|\.)(test|example|invalid|localhost)$/.test(domain) ||
    /(^|\.)example\.(com|net|org)$/.test(domain)
  );
}

// What the address gets, or `null` when the code itself went out. The reads
// are those of the two flows: `users` by exact address, as the sign-in
// callback does (lib/signIn.ts), and the password account by address, as
// Convex Auth's reset does.
async function noticeFor(
  ctx: MutationCtx,
  email: string,
  purpose: NoticePurpose,
): Promise<'noAccount' | 'noPassword' | null> {
  const user = await ctx.db
    .query('users')
    .withIndex('email', (q) => q.eq('email', email))
    .first();
  if (user === null) return 'noAccount';
  if (purpose === 'signin') return null;
  const passwordAccount = await ctx.db
    .query('authAccounts')
    .withIndex('providerAndAccountId', (q) =>
      q.eq('provider', 'password').eq('providerAccountId', email),
    )
    .first();
  return passwordAccount === null ? 'noPassword' : null;
}

export const requestNotice = mutation({
  args: { email: v.string(), purpose, locale },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    if (
      email.length > EMAIL_MAX_LENGTH ||
      !isEmail(email) ||
      isReservedAddress(email)
    ) {
      return null;
    }
    const kind = await noticeFor(ctx, email, args.purpose);
    if (kind === null) return null;

    // Consumed only for an address that gets a notice, and never thrown: a
    // RATE_LIMITED here would tell the caller the address has no account.
    const bucket = await callerIpBucket(ctx);
    const allowed =
      (await consumeRateLimit(ctx, {
        key: `accountNotice:${email}`,
        ...NOTICE_LIMITS.perAddress,
      })) &&
      (bucket === null ||
        (await consumeRateLimit(ctx, {
          key: `ip:accountNotice:${bucket}`,
          ...NOTICE_LIMITS.perIp,
        }))) &&
      (await consumeRateLimit(ctx, {
        key: 'form:accountNotice',
        ...NOTICE_LIMITS.global,
      }));
    if (!allowed) return null;

    await ctx.scheduler.runAfter(0, internal.accountNotices.sendNotice, {
      email,
      kind,
      purpose: args.purpose,
      locale: args.locale,
    });
    return null;
  },
});

// Sending in an ACTION (network calls are forbidden in mutations). A failed
// send is logged and not retried: the notice is a courtesy, the person can ask
// again from the screen.
export const sendNotice = internalAction({
  args: { email: v.string(), kind: noticeKind, purpose, locale },
  returns: v.null(),
  handler: async (_ctx, { email, kind, purpose, locale: loc }) => {
    const siteUrl = process.env.SITE_URL ?? 'http://localhost:3000';
    const { subject, html } =
      kind === 'noAccount'
        ? unknownAccountEmail({ siteUrl, locale: loc, purpose })
        : passwordlessAccountEmail({ siteUrl, locale: loc });
    await sendEmail({ to: email, subject, html });
    return null;
  },
});
