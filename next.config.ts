import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Content-Security-Policy (sécurité — défense en profondeur). 'unsafe-inline'
// reste nécessaire (script d'init du thème + scripts inline de Next ; styles
// inline de framer-motion / Tailwind). connect-src ouvre Convex (https + wss,
// sync temps réel + stockage) et Sanity. Le Studio `/studio` est EXCLU de la
// CSP (app cliente lourde, susceptible d'avoir besoin d'eval) — voir headers().
//
// La CSP est TOUJOURS posée (cohérence dev/prod + testable), mais RELÂCHÉE en
// développement : React et Turbopack (Fast Refresh / HMR) exigent `eval()` et
// un websocket de rechargement. `'unsafe-eval'` et `ws://localhost` ne sont
// ajoutés QU'en dev — la CSP de PROD reste stricte (React n'eval jamais en prod).
const isDev = process.env.NODE_ENV !== 'production';
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "img-src 'self' data: blob: https://cdn.sanity.io",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  `connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://*.convex.site https://*.sanity.io wss://*.sanity.io${isDev ? ' ws://localhost:* http://localhost:*' : ''}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join('; ');

// En-têtes sans risque, appliqués partout (y compris /studio).
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

// Démo / préprod : empêcher l'indexation tant que ce n'est pas le site final
// (variable `DEMO_NOINDEX` posée sur le déploiement de démo, à retirer au
// lancement réel).
if (process.env.DEMO_NOINDEX) {
  baseSecurityHeaders.push({
    key: 'X-Robots-Tag',
    value: 'noindex, nofollow',
  });
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Images: documentary photos (Sanity CDN) + placeholders.
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'cdn.sanity.io' }],
  },
  async headers() {
    return [
      // En-têtes de base (sans risque) sur toutes les routes.
      { source: '/:path*', headers: baseSecurityHeaders },
      // CSP partout SAUF le Studio Sanity (négatif lookahead, même style que le
      // matcher du proxy). Toujours posée ; relâchée en dev (voir `csp`).
      {
        source: '/((?!studio).*)',
        headers: [{ key: 'Content-Security-Policy', value: csp }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
