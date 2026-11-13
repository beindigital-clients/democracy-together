import { isEmail, isReservedEmail } from './validation';
import { normalizeEmail } from './onboarding';

// CERCLE DES AMIS — E-MAIL ALERT WHEN A REQUEST ARRIVES.
//
// A request waits for the president's decision on /admin/cercle, and nothing
// told anyone it was there. This alert says so — and only that: a request is
// waiting, how many are, and where to open them. It NEVER carries the
// applicant's name, address, motivation, CV or summary: an alert mailbox is
// read in more places than the screen is.

/** At most one alert per window; later requests are covered by a follow-up. */
export const ALERT_WINDOW_MS = 15 * 60 * 1000;

// A handful of people, not a distribution list.
export const ALERT_RECIPIENTS_MAX = 5;

/**
 * Who is told: the addresses of the Convex variable `CERCLE_ALERT_EMAILS`
 * (comma, semicolon or space separated). No address lives in the code. Unset
 * or empty means nobody is told — and nothing fails. Invalid addresses and
 * reserved test domains are dropped, duplicates collapse.
 */
export function alertRecipients(
  raw: string | undefined = process.env.CERCLE_ALERT_EMAILS,
): string[] {
  const out: string[] = [];
  for (const part of (raw ?? '').split(/[,;\s]+/)) {
    const email = normalizeEmail(part);
    if (!email || !isEmail(email) || isReservedEmail(email)) continue;
    if (!out.includes(email)) out.push(email);
    if (out.length >= ALERT_RECIPIENTS_MAX) break;
  }
  return out;
}

export type AlertState = {
  lastAlertAt: number;
  /** A follow-up is already scheduled for the end of the window. */
  followUpAt?: number;
};

export type AlertPlan =
  // First request in a while: tell now, and the window starts.
  | { kind: 'now' }
  // Inside the window: cover it with ONE follow-up when the window ends.
  | { kind: 'follow-up'; delayMs: number }
  // Inside the window, follow-up already scheduled: nothing to add.
  | { kind: 'none' };

/** What a new request triggers, given the last alert. Pure. */
export function planAlert(state: AlertState | null, now: number): AlertPlan {
  if (!state || now - state.lastAlertAt >= ALERT_WINDOW_MS) {
    return { kind: 'now' };
  }
  if (state.followUpAt !== undefined) return { kind: 'none' };
  return {
    kind: 'follow-up',
    delayMs: Math.max(0, state.lastAlertAt + ALERT_WINDOW_MS - now),
  };
}
