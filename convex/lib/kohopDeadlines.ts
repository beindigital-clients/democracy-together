import { KOHOP_REMINDERS } from './kohop';

// KOHOP — what the deadline cron decides about one awaited reply or analysis.
// Pure: the cron reads the rows, this module says what to do with each.
//
// Reminders: the first one `beforeDeadlineMs` before the deadline, then one
// every `intervalMs`, `max` at most. The counter `remindersSent` is the only
// state: reminder number k is due at `dueAt - beforeDeadlineMs + k * interval`.
// A reminder is never sent once the deadline has passed (the reviewer expires).

export type DeadlineAction = 'none' | 'remind' | 'expire';

/** When reminder number `sent` (0-based) becomes due. */
export function reminderDueAt(dueAt: number, sent: number): number {
  return (
    dueAt - KOHOP_REMINDERS.beforeDeadlineMs + sent * KOHOP_REMINDERS.intervalMs
  );
}

export function deadlineAction(input: {
  dueAt: number;
  remindersSent: number;
  now: number;
}): DeadlineAction {
  const { dueAt, remindersSent, now } = input;
  if (now >= dueAt) return 'expire';
  if (
    remindersSent < KOHOP_REMINDERS.max &&
    now >= reminderDueAt(dueAt, remindersSent)
  ) {
    return 'remind';
  }
  return 'none';
}
