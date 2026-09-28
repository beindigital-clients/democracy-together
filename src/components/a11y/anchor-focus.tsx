'use client';

import { useEffect } from 'react';

// After an anchor jump, FOCUS must follow the scroll (issue #46): otherwise
// tabbing restarts from the clicked link — at the bottom of the page, in the
// footer — and the link is useless for keyboard and screen reader users.
//
// The browser can do it on its own: "scroll to the fragment" focuses the
// fragment's target, hence the `tabIndex={-1}` set on the sections (a bare
// `<section>` is not focusable, so focus has nowhere to go).
// This covers a direct load of `/a-propos#gouvernance` and going back.
//
// But a footer link is a CLIENT navigation, and since Next 16 the App
// Router's scroll handler (`InnerScrollHandlerNew`, enabled by default)
// scrolls to the anchor while "leaving focus intact". Checked in the
// browser: without this component, focus stays on the footer link.
//
// This component therefore ONLY moves focus, and does not scroll by itself
// (`preventScroll`): the movement stays the browser's, hence subject to
// `scroll-behavior`, which globals.css forces to `auto` under
// `prefers-reduced-motion`. A home-made `scrollIntoView({ behavior: 'smooth' })`
// would bypass that preference — which is precisely what must not be done.
//
// It is mounted by the PAGE that holds the anchors, not by the layout: it only
// acts on that page's targets (`focus()` on a non-focusable element has
// no effect) and costs nothing on other routes.
function focusTarget(hash: string): HTMLElement | null {
  const id = decodeURIComponent(hash.replace(/^#/, ''));
  const el = id ? document.getElementById(id) : null;
  el?.focus({ preventScroll: true });
  return el;
}

export function AnchorFocus() {
  useEffect(() => {
    // Client navigation from ANOTHER route: the page has just been mounted
    // and the URL already carries the anchor. On a direct load, the browser has
    // already focused the target — focusing it again in the same place does nothing.
    focusTarget(window.location.hash);

    const onHistory = () => focusTarget(window.location.hash);

    // Click on an anchor of the CURRENT page — the footer is also rendered
    // on `/a-propos`. The router pushes the URL without remounting the tree: no
    // effect re-runs, and no `hashchange` is fired since Next goes through
    // `history.pushState`. All that remains is the click itself.
    //
    // In the CAPTURE phase: Next's `<Link>` cancels the event
    // (`preventDefault`, that is how it takes over navigation) from React's
    // delegated handler, attached to `document` — so before us in the bubble
    // phase, and `defaultPrevented` would always be true.
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const link = (e.target as Element | null)?.closest?.('a[href]');
      if (!(link instanceof HTMLAnchorElement) || !link.hash) return;
      if (link.origin !== window.location.origin) return;
      if (link.pathname !== window.location.pathname) return;

      const target = focusTarget(link.hash);

      // Strictly identical URL: the router considers there is nothing to do
      // and does not scroll. It is up to the link to keep its promise — through
      // the BROWSER's scrolling, with no options, hence governed by the same
      // `scroll-behavior` rule as the rest.
      if (target && link.href === window.location.href) target.scrollIntoView();
    };

    window.addEventListener('hashchange', onHistory);
    window.addEventListener('popstate', onHistory);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('hashchange', onHistory);
      window.removeEventListener('popstate', onHistory);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  return null;
}
