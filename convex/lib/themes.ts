// THEMES vocabulary — single declaration, pure logic (issue #30).
//
// The project handles TWO distinct vocabularies, which their shared name
// `THEMES` long conflated:
//
//  - the **network axes** (this file): the 5 axes under which a publication,
//    a Tribune post, a call for projects or a workspace is filed. They were
//    copied verbatim in convex/projects.ts, convex/tribune.ts,
//    convex/workspaces.ts and convex/lib/publications.ts;
//  - the **directory themes** (convex/lib/directory.ts, renamed
//    `DIRECTORY_THEMES`): 10 areas of expertise declared by a think tank.
//
// The two lists have neither the same size nor the same values: merging them
// would break the directory. So they are NOT synchronised with each other —
// but each is now declared only once, which is the only point that matters.
//
// Values are neutral *slugs* stored in the database; labels are translated on
// the Next side (`library.themes` messages). Keep this list in sync with
// src/messages/*.json.

import { v } from 'convex/values';

export const NETWORK_THEMES = [
  'gouvernance-numerique',
  'participation',
  'anti-corruption',
  'transitions',
  'crises',
] as const;

export type NetworkTheme = (typeof NETWORK_THEMES)[number];

// Type guard: `NETWORK_THEMES.includes(x)` cannot be called with a `string`
// (the list is `as const`, so its element is a literal type). Going through
// this function avoids a cast at every call site and gives the compiler the
// type narrowing a cast would lose.
export function isNetworkTheme(value: string): value is NetworkTheme {
  return (NETWORK_THEMES as readonly string[]).includes(value);
}

// Argument validator for a network axis. Built here rather than copied into
// each query: adding an axis to NETWORK_THEMES opens it everywhere at once.
export const networkThemeValidator = v.union(
  ...NETWORK_THEMES.map((t) => v.literal(t)),
);
