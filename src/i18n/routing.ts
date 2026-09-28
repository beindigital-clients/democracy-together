import { defineRouting } from 'next-intl/routing';

// Language in the URL (/fr, /en, /es, /pt, /ar) — an SEO choice: each language = a
// distinct URL, indexable, CDN-cacheable, with hreflang. The preference is
// remembered by next-intl in a cookie (NEXT_LOCALE), readable server-side
// from the 1st render.
//
// ARABIC IS SERVED, and it has not always been. This comment claimed
// the architecture was "extensible (pt, ar + RTL) without a rewrite", which the audit
// disproved (issue #23): the stylesheet was written with PHYSICAL
// properties (`text-left`, `border-l`…) and the fonts only loaded the
// Latin subset. Both defects are fixed — the 43 physical
// utilities were switched to logical ones (`text-start`, `border-s`…), and
// `src/lib/fonts.ts` loads the Arabic subset. What remains true:
// ADDING ONE MORE LANGUAGE written left to right only requires one
// entry here, a message catalogue and its editorial content blocks.
//
// THE ORDER IS THAT OF THE LANGUAGE PICKER, which iterates over this list. It is
// not alphabetical: the default language comes first, then English as the
// network's working language, then the languages added for North
// Africa and the Americas.
export const routing = defineRouting({
  locales: ['fr', 'en', 'es', 'pt', 'ar'],
  defaultLocale: 'fr',
  localePrefix: 'always',
});

export type Locale = (typeof routing.locales)[number];
