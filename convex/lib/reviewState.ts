// Review state machines (audit M6 · issue #9) — generalisation of the guard
// added to `organizations.reviewApplication` by PR #4.
//
// The defect fixed: a review mutation that does not read the current status
// decides twice. A double click REPLAYS the decision; a click on the other
// button REVERSES it. And since these mutations are AUDITED, each pass writes
// one more entry: the history ends up showing three contradictory decisions
// on the same case with no way to tell which one is authoritative — worse
// than no history at all for an association that will have to account for
// its decisions.
//
// The rule: each review mutation declares its domain's transition table
// ABOVE the handler (it documents the machine) and calls `assertTransition`
// at the top of the handler. The `throw` rolls back the transaction: a
// refused decision therefore writes NEITHER the document NOR the audit row.
//
// Two errors, and only two:
//   - ALREADY_REVIEWED   : the starting state is ALREADY DECIDED — replay or
//     reversal of a decision already taken;
//   - INVALID_TRANSITION : the starting state awaits no decision —
//     publication never submitted, review without an assigned reviewer, case
//     already back in the queue.
//
// Going back remains possible — reopening a case decided by mistake — but it
// is a NAMED transition: a dedicated `reopen*` mutation, recorded in
// `auditLog` under its own action, never the side effect of a second click.

export type ReviewMachine<S extends string> = {
  // Starting state -> legitimate target states. Missing key = dead end.
  readonly transitions: Readonly<Partial<Record<S, readonly S[]>>>;
  // "Decided" states: leaving them is a replay or a reversal.
  readonly decided: readonly S[];
};

type Refusal = 'ALREADY_REVIEWED' | 'INVALID_TRANSITION';

function refusalFrom<S extends string>(
  from: S,
  machine: ReviewMachine<S>,
): Refusal {
  return machine.decided.includes(from)
    ? 'ALREADY_REVIEWED'
    : 'INVALID_TRANSITION';
}

// The error matching the STARTING state — usable as is for guards that are
// not a state change (submitting a review opinion).
export function reviewStateError<S extends string>(
  from: S,
  machine: ReviewMachine<S>,
): Error {
  return new Error(refusalFrom(from, machine));
}

// The refusal for going from `from` to `to`, or `null` when the machine allows
// it. `assertTransition` throws it as an `Error`. A module whose refusals
// reach the client as `ConvexError` data (convex/projectCalls.ts) throws it
// that way instead: Convex redacts a plain `Error`'s message in production,
// not a `ConvexError`'s data.
export function transitionRefusal<S extends string>(
  from: S,
  to: S,
  machine: ReviewMachine<S>,
): Refusal | null {
  return (machine.transitions[from] ?? []).includes(to)
    ? null
    : refusalFrom(from, machine);
}

export function assertTransition<S extends string>(
  from: S,
  to: S,
  machine: ReviewMachine<S>,
): void {
  if (transitionRefusal(from, to, machine)) {
    throw reviewStateError(from, machine);
  }
}
