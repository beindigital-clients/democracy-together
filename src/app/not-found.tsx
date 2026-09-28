import type { Metadata } from 'next';

// ROOT 404 — the one served for an address with no route at all AND that the
// middleware could not rewrite (R-04): since 27/09, `src/proxy.ts`
// rewrites any unknown first segment under a language prefix
// (`/fr/nimporte-quoi`, `/ar/xyz`) to `/<locale>/introuvable`, rendered in
// the language layout; and a path without a prefix (`/xx`, `/de`) is first
// redirected by next-intl to its language. All that is left for this page is
// what the middleware matcher excludes — "file" paths (`/favicon-truc.png`,
// `/x.y`) — as opposed to the localized 404 of `[locale]/not-found.tsx`,
// which answers `notFound()` calls thrown from an existing route.
//
// WHY TWO, and why this one cannot be that one (audit F-06).
//
// Measured on Next 16.3.5: a 404 triggered by `notFound()` from a route that
// MATCHES renders a `<body>` with no text at all — the content only arrives
// via the RSC payload, hence only if JavaScript runs. A 404 WITHOUT a
// matching route, on the other hand, is properly rendered in the served HTML.
// Three hypotheses were ruled out by measurement before arriving at this:
// suspension of the component (a synchronous version gives the same blank),
// its place in the tree (a root `not-found` changes nothing for the
// `notFound()` case), and the layout shell (its `<head>` is rendered, its
// `<body>` is not).
//
// This file therefore does not fix F-06: it closes the other half of the
// issue. Without it, an address with no route got Next's default 404 — in
// English, off-brand, outside the site. That is the criticism audit § 5.1
// already made, and which had only been addressed for `notFound()` calls.
//
// BILINGUAL, and deliberately so: this file lives OUTSIDE the `[locale]`
// segment, so it has no language context — neither `params` nor next-intl.
// Guessing from the URL would be wrong half the time (`/xx`, `/favicon-truc`).
// Showing both languages is the only honest answer.
//
// INLINE STYLES: there is no root layout in this repo
// (`src/app/[locale]/layout.tsx` is a segment layout), so `globals.css`
// is not loaded here. A Tailwind class would have no effect.

export const metadata: Metadata = {
  title: 'Page introuvable · Democracy Together',
  robots: { index: false, follow: true },
};

const PAGE: React.CSSProperties = {
  margin: 0,
  minHeight: '100dvh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '48px 24px',
  background: '#fbfaf8',
  color: '#15202b',
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  lineHeight: 1.55,
};

const LIEN: React.CSSProperties = {
  display: 'inline-block',
  padding: '10px 18px',
  borderRadius: 3,
  background: '#15202b',
  color: '#ffffff',
  textDecoration: 'none',
  fontWeight: 600,
  fontSize: 15,
};

export default function RootNotFound() {
  return (
    <html lang="fr">
      <body style={PAGE}>
        <main style={{ maxWidth: 560 }}>
          <div
            style={{
              width: 44,
              height: 4,
              background: '#f58b1a',
              marginBottom: 28,
            }}
          />
          <p
            style={{
              margin: 0,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 12,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#6b7683',
            }}
          >
            Erreur 404
          </p>

          <h1
            style={{
              margin: '12px 0 0',
              fontSize: 30,
              letterSpacing: '-0.01em',
            }}
          >
            Page introuvable
          </h1>
          <p style={{ margin: '10px 0 0', color: '#4a5561' }}>
            Cette adresse ne correspond à aucune page du site.
          </p>

          <h2
            lang="en"
            style={{
              margin: '28px 0 0',
              fontSize: 30,
              letterSpacing: '-0.01em',
              fontWeight: 400,
              color: '#4a5561',
            }}
          >
            Page not found
          </h2>
          <p lang="en" style={{ margin: '10px 0 0', color: '#6b7683' }}>
            This address does not match any page on the site.
          </p>

          <p style={{ margin: '32px 0 0', display: 'flex', gap: 12 }}>
            <a href="/fr" style={LIEN}>
              Accueil
            </a>
            <a
              lang="en"
              href="/en"
              style={{
                ...LIEN,
                background: '#ffffff',
                color: '#15202b',
                border: '1px solid #d7d2cb',
              }}
            >
              Home
            </a>
          </p>
        </main>
      </body>
    </html>
  );
}
