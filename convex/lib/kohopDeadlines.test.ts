import { describe, expect, it } from 'vitest';
import { KOHOP_REMINDERS } from './kohop';
import { deadlineAction, reminderDueAt } from './kohopDeadlines';

const DAY = 24 * 60 * 60 * 1000;
const dueAt = 100 * DAY;

describe('deadlineAction', () => {
  it('does nothing long before the deadline', () => {
    expect(
      deadlineAction({ dueAt, remindersSent: 0, now: dueAt - 10 * DAY }),
    ).toBe('none');
  });

  it('sends the first reminder three days before', () => {
    expect(
      deadlineAction({ dueAt, remindersSent: 0, now: dueAt - 3 * DAY }),
    ).toBe('remind');
    expect(
      deadlineAction({ dueAt, remindersSent: 0, now: dueAt - 3 * DAY - 1 }),
    ).toBe('none');
  });

  it('does not repeat a reminder already sent for the window', () => {
    expect(
      deadlineAction({ dueAt, remindersSent: 1, now: dueAt - 2 * DAY }),
    ).toBe('none');
    expect(deadlineAction({ dueAt, remindersSent: 1, now: dueAt })).toBe(
      'expire',
    );
  });

  it('expires at the deadline, whatever the reminders', () => {
    expect(deadlineAction({ dueAt, remindersSent: 0, now: dueAt })).toBe(
      'expire',
    );
    expect(deadlineAction({ dueAt, remindersSent: 3, now: dueAt + DAY })).toBe(
      'expire',
    );
  });

  it('never sends more than the maximum', () => {
    expect(
      deadlineAction({
        dueAt,
        remindersSent: KOHOP_REMINDERS.max,
        now: dueAt - 1,
      }),
    ).toBe('none');
  });

  it('spaces the reminders by the interval', () => {
    expect(reminderDueAt(dueAt, 1) - reminderDueAt(dueAt, 0)).toBe(
      KOHOP_REMINDERS.intervalMs,
    );
  });
});
