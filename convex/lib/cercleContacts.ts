import type { MutationCtx } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';
import type { SiteLocale } from './locales';
import { CERCLE_MAILING_TEXT_VERSION } from './cercleMailing';

// Writes to the Cercle's mailing list shared by the request approval
// (convex/cercle.ts) and the import (convex/cercleMailing.ts).

/** 128-bit random token of an unsubscribe link, in hexadecimal. */
export function newUnsubToken(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Puts an address on the list as CONFIRMED, because the person just asked to
 * join the Cercle (and was shown, before sending, that they would receive its
 * news). Whatever the address was before — absent, pending an imported
 * confirmation, or UNSUBSCRIBED — this explicit request is the consent: an
 * earlier "no" is lifted only by a new, informed "yes".
 */
export async function confirmContactFromRequest(
  ctx: MutationCtx,
  args: {
    email: string;
    locale?: SiteLocale;
    consentAt: number;
    textVersion?: string;
  },
): Promise<Doc<'cercleContacts'>['_id']> {
  const existing = await ctx.db
    .query('cercleContacts')
    .withIndex('by_email', (q) => q.eq('email', args.email))
    .unique();
  const consent = {
    at: args.consentAt,
    via: 'request' as const,
    textVersion: args.textVersion ?? CERCLE_MAILING_TEXT_VERSION,
  };
  if (existing) {
    await ctx.db.patch(existing._id, {
      status: 'confirmed',
      confirmedAt: args.consentAt,
      unsubscribedAt: undefined,
      confirmTokenHash: undefined,
      confirmExpiresAt: undefined,
      confirmError: undefined,
      consent,
      ...(args.locale ? { locale: args.locale } : {}),
    });
    return existing._id;
  }
  return await ctx.db.insert('cercleContacts', {
    email: args.email,
    ...(args.locale ? { locale: args.locale } : {}),
    status: 'confirmed',
    source: 'request',
    unsubToken: newUnsubToken(),
    confirmSends: 0,
    confirmedAt: args.consentAt,
    consent,
    createdAt: args.consentAt,
  });
}
