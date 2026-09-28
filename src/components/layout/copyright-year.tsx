'use client';

import { useEffect, useState } from 'react';

// Year of the footer's copyright notice (issue #36).
//
// It is computed SERVER-SIDE — `site-footer.tsx` is a server component —
// and received here as `serverYear`. The served HTML thus already carries the
// right year, including for a visitor without JavaScript (F-05, low bandwidth).
//
// This component exists for two pitfalls that the server computation alone
// does not cover together:
//
//  1. HYDRATION MISMATCH — the issue's trap. Reading the clock during a
//     client component's RENDER would produce, on the night of 31 December or
//     from an offset time zone, a server HTML and a first client render that
//     differ; React reports the mismatch and replays the tree. Here the first
//     client render reuses `serverYear` as is: there is no mismatch to report,
//     hence nothing to mask with `suppressHydrationWarning`.
//
//  2. FROZEN PAGE. As long as routes are dynamic, the server computation is
//     enough. But issue #13 targets static rendering served by a CDN: the HTML
//     would then be produced once at build time and served for months, and the
//     year would freeze in it — the bug fixed here would come back in another
//     form. The correction therefore happens AFTER mount, in an effect, and
//     only if the browser is in a year LATER than the served render.
//     The normal case (same years) triggers no extra render.
export function CopyrightYear({ serverYear }: { serverYear: number }) {
  const [year, setYear] = useState(serverYear);

  useEffect(() => {
    // FORWARD correction only. A device clock running behind — hardly
    // exceptional on the entry-level devices targeted by the
    // project scope — would otherwise show a year EARLIER than the render's,
    // i.e. a footer more wrong than the one being fixed.
    const browserYear = new Date().getFullYear();
    if (browserYear > serverYear) setYear(browserYear);
  }, [serverYear]);

  return <>{year}</>;
}
