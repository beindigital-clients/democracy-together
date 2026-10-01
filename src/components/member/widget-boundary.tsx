'use client';

import { Component, type ReactNode } from 'react';

// ERROR CONTAINMENT for one dashboard block.
//
// The dashboard assembles a dozen independent reads (profile, messages,
// contributions, membership fee, security…). `useQuery` THROWS when a read
// fails, and without a boundary the nearest one is the route's: a single
// refused read — a function not yet deployed on the backend, an account state
// the server rejects — replaced the WHOLE member area with "Une erreur est
// survenue". A block that cannot load now says so in its own frame, and the
// rest of the page stays usable.
//
// A class component because React offers no hook for this.

export class WidgetBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // Kept visible to developers: a silent fallback would hide a real bug.
    console.error('[member area] block unavailable', error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
