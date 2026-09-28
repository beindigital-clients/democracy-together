'use client';

import { useState } from 'react';

// "NOT YET KNOWN" IS NOT "NOBODY".
//
// Convex's `useQuery` returns `undefined` until a response has arrived,
// and the VALUE — often `null` — once it has. The two
// look alike under a `!valeur`, and that shortcut is costly: `undefined`
// comes back on EVERY socket reconnection and every access-token rotation,
// on a query already resolved once.
//
// A screen that renders "Chargement…" in this state UNMOUNTS its subtree on
// every flicker. For the user, it's not a flicker:
// it's a confirmation dialog disappearing under the cursor,
// a lost draft, a gesture to redo — and nothing on screen to say
// why. Observed in CI on `/admin/utilisateurs`: the "Changer le
// rôle de … ?" dialog detached from the DOM while its button was being clicked.
//
// This hook retains the last KNOWN value. The first render has none and
// therefore returns `undefined`: the initial loading screen is preserved, it is
// only the subsequent flicker that stops sweeping everything away.
//
// WHAT IT DOES NOT DO: retain a `null`. A query that answers "nobody"
// is an answer, not an absence of answer — a sign-out must leave
// the screen, and it does.
//
// It weakens no authorization. The role read here decides what is
// DISPLAYED; what one is allowed to DO is refused by the server on every
// mutation, `users.setRole` included.
//
// IMPLEMENTATION: state adjusted DURING render, not a ref. React
// documents this pattern, and `react-hooks/refs` forbids the other — reading or writing
// `ref.current` during render produces components that don't update
// properly. The `valeur !== dernier` comparison bounds the loop: without it,
// each render would request another one.
export function useConnu<T>(valeur: T | undefined): T | undefined {
  const [dernier, setDernier] = useState<T | undefined>(valeur);
  if (valeur !== undefined && valeur !== dernier) setDernier(valeur);
  return valeur === undefined ? dernier : valeur;
}
