'use client';

import type { ReactNode } from 'react';
import { ConvexReactClient } from 'convex/react';
import { ConvexAuthNextjsProvider } from '@convex-dev/auth/nextjs';

// `unsavedChangesWarning: false` — R-12 / member A-12.
//
// By default (`BaseConvexClientOptions.unsavedChangesWarning`, "true in
// browsers": node_modules/convex/dist/esm-types/browser/sync/client.d.ts),
// the client sets a `beforeunload` which, while a mutation is in flight,
// opens the native dialog "Are you sure you want to leave? Your changes may
// not be saved." (browser/sync/client.js, BaseConvexClient constructor).
// Here that dialog fired when leaving `/recherche` after a mere
// gesture — the in-flight mutation was `recordPublicationView`, or a similar
// background write: nothing the user had typed, and a message in
// English whatever the site's language (measured on 27/09). No screen
// relies on this warning: forms await their response with the
// button greyed out, and a lost counter write doesn't deserve a dialog.
//
// REMAINING, out of reach of any option: `ConvexAuthProvider`
// (@convex-dev/auth/dist/react/client.js) sets its own `beforeunload`
// during token refresh (`isRefreshingToken`), with the same
// English text. The window is short (the duration of a call to /api/auth);
// it is not configurable in the repository's version 0.0.94.
const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
});

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthNextjsProvider client={convex}>
      {children}
    </ConvexAuthNextjsProvider>
  );
}
