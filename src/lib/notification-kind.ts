// What a notification is ABOUT, read from its catalogue key (`titleKey`), so
// that a list of notifications can be scanned by its icons before its words —
// a new follower, a message, a decision on a text — the way social networks
// show them. Pure, so the rule is tested without a component.

export type NotificationKind =
  | 'follow'
  | 'message'
  | 'publication'
  | 'review'
  | 'tribune'
  | 'membership'
  | 'payment'
  | 'workspace'
  | 'organization'
  | 'programme'
  | 'other';

// Longest prefixes first: `peerReview…` before a shorter one would catch it.
const PREFIXES: ReadonlyArray<readonly [string, NotificationKind]> = [
  ['socialFollow', 'follow'],
  ['socialMessage', 'message'],
  ['peerReview', 'review'],
  ['manuscript', 'review'],
  ['pub', 'publication'],
  ['tribune', 'tribune'],
  ['membership', 'membership'],
  ['payment', 'payment'],
  ['workspace', 'workspace'],
  ['org', 'organization'],
  ['youthProgramme', 'programme'],
  ['mentoring', 'programme'],
  ['projectCall', 'programme'],
];

export function notificationKind(titleKey: string): NotificationKind {
  for (const [prefix, kind] of PREFIXES) {
    if (titleKey.startsWith(prefix)) return kind;
  }
  return 'other';
}
