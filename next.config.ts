import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { convexCspOrigins } from './src/lib/convex-origins';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Content-Security-Policy (security — defense in depth). 'unsafe-inline'
// remains necessary (theme init script + Next inline scripts; inline
// styles from framer-motion / Tailwind). connect-src opens Convex (https + wss,
// real-time sync + storage) and Sanity. reCAPTCHA v3 (anti-spam for public
// forms) loads its script from www.google.com / www.gstatic.com, opens an
// invisible iframe (frame-src) and a scoring XHR (connect-src) to Google.
// The `/studio` Studio is EXCLUDED from the CSP (heavy client app, likely
// to need eval) — see headers().
//
// The CSP is ALWAYS set (dev/prod consistency + testable), but RELAXED in
// development: React and Turbopack (Fast Refresh / HMR) require `eval()` and
// a reload websocket. `'unsafe-eval'` and `ws://localhost` are
// added ONLY in dev — the PROD CSP remains strict (React never evals in prod).
const isDev = process.env.NODE_ENV !== 'production';
// Non-cloud Convex deployment (self-hosted, or local with `npx convex dev
// --local`): its origin is not covered by `*.convex.cloud`, and without it
// the CSP silently cuts the sync websocket. Empty for a `*.convex.cloud`.
const convexOrigins = convexCspOrigins(process.env.NEXT_PUBLIC_CONVEX_URL);
const extra = (origins: string[]) =>
  origins.length ? ` ${origins.join(' ')}` : '';
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  // `*.convex.cloud` IS NEEDED HERE, and not only in `connect-src`:
  // the illustrations extracted from attached PDFs are served from Convex
  // storage (`ctx.storage.getUrl()` -> https://<deployment>.convex.cloud/api/
  // storage/<id>) and rendered by the document view. Without this origin, the
  // browser blocks EVERY image of the translated document — that is, what the
  // feature exists to preserve — and the reader only gets
  // broken icons, which they save as is into their PDF.
  `img-src 'self' data: blob: https://cdn.sanity.io https://*.convex.cloud${extra(convexOrigins.img)}`,
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline' https://www.google.com https://www.gstatic.com${isDev ? " 'unsafe-eval'" : ''}`,
  // Replays (F-54, "content" workstream): YouTube players — the
  // "nocookie" domain, with no tracker before playback — and Vimeo. Only these two
  // origins: the embed address is recomputed server-side from a
  // link validated against its platform, never copied as entered.
  "frame-src 'self' https://www.google.com https://www.youtube-nocookie.com https://player.vimeo.com",
  // Replays as a video FILE (mp4, webm…) hosted off-site: https
  // only, checked on entry (`validateVideoUrl`).
  "media-src 'self' https:",
  `connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://*.convex.site https://*.sanity.io wss://*.sanity.io https://www.google.com${extra(convexOrigins.connect)}${isDev ? ' ws://localhost:* http://localhost:*' : ''}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join('; ');

// Risk-free headers, applied everywhere (including /studio).
const baseSecurityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  },
];

// Demo / pre-prod: prevent indexing as long as this is not the final site
// (`DEMO_NOINDEX` variable set on the demo deployment, to be removed at the
// real launch).
if (process.env.DEMO_NOINDEX) {
  baseSecurityHeaders.push({
    key: 'X-Robots-Tag',
    value: 'noindex, nofollow',
  });
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `X-Powered-By: Next.js` tells the user nothing and tells the
  // attacker something (noted on 27/09, security headers).
  poweredByHeader: false,
  // Images: documentary photos (Sanity CDN) + placeholders.
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'cdn.sanity.io' }],
  },
  async headers() {
    return [
      // Base (risk-free) headers on all routes.
      { source: '/:path*', headers: baseSecurityHeaders },
      // CSP everywhere EXCEPT the Sanity Studio (negative lookahead, same style as the
      // proxy matcher). Always set; relaxed in dev (see `csp`).
      {
        source: '/((?!studio).*)',
        headers: [{ key: 'Content-Security-Policy', value: csp }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
