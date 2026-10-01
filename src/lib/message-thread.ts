// Layout of a private conversation thread — PURE, so that grouping, day
// dividers, the "new messages" divider and the "Seen" status can be tested
// without mounting the screen (tests/unit/message-thread.test.ts).

// Two messages from the same person less than this apart form one group:
// one avatar, one time stamp, tighter bubbles.
export const GROUP_GAP_MS = 5 * 60 * 1000;

export type ThreadMessage = {
  _id: string;
  fromMe: boolean;
  createdAt: number;
};

export type ThreadItem<M extends ThreadMessage> =
  | { kind: 'day'; key: string; at: number }
  | { kind: 'unread'; key: 'unread' }
  | {
      kind: 'message';
      key: string;
      message: M;
      // First / last bubble of a run from the same sender.
      first: boolean;
      last: boolean;
      // Only on MY most recent message: has the other person read it?
      status: 'seen' | 'sent' | null;
    };

// Local calendar day: the reader's day, not UTC's.
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function buildThreadItems<M extends ThreadMessage>(
  // Oldest first.
  messages: readonly M[],
  opts: {
    // Received messages after this instant were unread when the thread was
    // opened (`null`: no divider).
    unreadAfter: number | null;
    // The other person read up to this instant.
    otherLastReadAt: number;
  },
): ThreadItem<M>[] {
  const items: ThreadItem<M>[] = [];
  let lastMine = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].fromMe) {
      lastMine = i;
      break;
    }
  }
  let unreadPlaced = false;
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
    if (newDay) {
      items.push({
        kind: 'day',
        key: `day-${dayKey(m.createdAt)}`,
        at: m.createdAt,
      });
    }
    const isUnread =
      opts.unreadAfter !== null && !m.fromMe && m.createdAt > opts.unreadAfter;
    const unreadHere = isUnread && !unreadPlaced;
    if (unreadHere) {
      items.push({ kind: 'unread', key: 'unread' });
      unreadPlaced = true;
    }
    const joinsPrev =
      !!prev &&
      !newDay &&
      !unreadHere &&
      prev.fromMe === m.fromMe &&
      m.createdAt - prev.createdAt < GROUP_GAP_MS;
    const nextUnreadStart =
      !!next &&
      !unreadPlaced &&
      opts.unreadAfter !== null &&
      !next.fromMe &&
      next.createdAt > opts.unreadAfter;
    const joinsNext =
      !!next &&
      dayKey(next.createdAt) === dayKey(m.createdAt) &&
      !nextUnreadStart &&
      next.fromMe === m.fromMe &&
      next.createdAt - m.createdAt < GROUP_GAP_MS;
    items.push({
      kind: 'message',
      key: m._id,
      message: m,
      first: !joinsPrev,
      last: !joinsNext,
      status:
        i === lastMine
          ? opts.otherLastReadAt >= m.createdAt
            ? 'seen'
            : 'sent'
          : null,
    });
  });
  return items;
}
