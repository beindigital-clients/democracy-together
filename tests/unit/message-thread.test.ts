import { describe, it, expect } from 'vitest';
import {
  GROUP_GAP_MS,
  buildThreadItems,
  dayKey,
  type ThreadMessage,
} from '@/lib/message-thread';

const DAY = 24 * 60 * 60 * 1000;
// Noon, local time: far from midnight whatever the machine's zone.
const T0 = new Date(2026, 8, 30, 12, 0, 0).getTime();

function msg(id: string, fromMe: boolean, at: number): ThreadMessage {
  return { _id: id, fromMe, createdAt: at };
}

function shape(items: ReturnType<typeof buildThreadItems>) {
  return items.map((i) =>
    i.kind === 'message'
      ? `${i.key}:${i.first ? 'F' : ''}${i.last ? 'L' : ''}${i.status ? `:${i.status}` : ''}`
      : i.kind,
  );
}

describe('buildThreadItems', () => {
  it('groups a run from the same sender, splits on sender and on gap', () => {
    const items = buildThreadItems(
      [
        msg('a', false, T0),
        msg('b', false, T0 + 1000),
        msg('c', true, T0 + 2000),
        msg('d', true, T0 + 2000 + GROUP_GAP_MS + 1),
      ],
      { unreadAfter: null, otherLastReadAt: 0 },
    );
    expect(shape(items)).toEqual(['day', 'a:F', 'b:L', 'c:FL', 'd:FL:sent']);
  });

  it('one divider per calendar day', () => {
    const items = buildThreadItems(
      [msg('a', true, T0), msg('b', true, T0 + DAY)],
      { unreadAfter: null, otherLastReadAt: 0 },
    );
    expect(shape(items)).toEqual(['day', 'a:FL', 'day', 'b:FL:sent']);
    expect(dayKey(T0)).not.toBe(dayKey(T0 + DAY));
  });

  it('"new messages" divider before the first received unread message only', () => {
    const items = buildThreadItems(
      [
        msg('a', false, T0),
        msg('b', false, T0 + 1000),
        msg('c', false, T0 + 2000),
      ],
      { unreadAfter: T0, otherLastReadAt: 0 },
    );
    expect(shape(items)).toEqual(['day', 'a:FL', 'unread', 'b:F', 'c:L']);
  });

  it('"Seen" only on my latest message, once the other read past it', () => {
    const list = [msg('a', true, T0), msg('b', true, T0 + 1000)];
    expect(
      shape(buildThreadItems(list, { unreadAfter: null, otherLastReadAt: T0 })),
    ).toEqual(['day', 'a:F', 'b:L:sent']);
    expect(
      shape(
        buildThreadItems(list, {
          unreadAfter: null,
          otherLastReadAt: T0 + 1000,
        }),
      ),
    ).toEqual(['day', 'a:F', 'b:L:seen']);
  });

  it('empty thread: nothing', () => {
    expect(
      buildThreadItems([], { unreadAfter: 0, otherLastReadAt: 0 }),
    ).toEqual([]);
  });
});
