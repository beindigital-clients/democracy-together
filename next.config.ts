import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { convexCspOrigins } from './src/lib/convex-origins';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Content-Security-Policy (sécurité — défense en profondeur). 'unsafe-inline'
// reste nécessaire (script d'init du thème + scripts inline de Next ; styles
// inline de framer-motion / Tailwind). connect-src ouvre Convex (https + wss,
// sync temps réel + stockage) et Sanity. reCAPTCHA v3 (anti-spam formulaires
// publics) charge son script depuis www.google.com / www.gstatic.com, ouvre une
// iframe invisible (frame-src) et un XHR de scoring (connect-src) vers Google.
// Le Studio `/studio` est EXCLU de la CSP (app cliente lourde, susceptible
// d'avoir besoin d'eval) — voir headers().
//
// La CSP est TOUJOURS posée (cohérence dev/prod + testable), mais RELÂCHÉE en
// développement : React et Turbopack (Fast Refresh / HMR) exigent `eval()` et
// un websocket de rechargement. `'unsafe-eval'` et `ws://localhost` ne sont
// ajoutés QU'en dev — la CSP de PROD reste stricte (React n'eval jamais en prod).
const isDev = process.env.NODE_ENV !== 'production';
// Déploiement Convex hors cloud (auto-hébergé, ou local avec `npx convex dev
// --local`) : son origine n'est pas couverte par `*.convex.cloud`, et sans elle
// la CSP coupe le websocket de sync en silence. Vide pour un `*.convex.cloud`.
const convexOrigins = convexCspOrigins(process.env.NEXT_PUBLIC_CONVEX_URL);
const extra = (origins: string[]) =>
  origins.length ? ` ${origins.join(' ')}` : '';
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  // `*.convex.cloud` EST NÉCESSAIRE ICI, et pas seulement dans `connect-src` :
  // les illustrations extraites des PDF joints sont servies depuis le stockage
  // Convex (`ctx.storage.getUrl()` -> https://<déploiement>.convex.cloud/api/
  // storage/<id>) et rendues par la vue document. Sans cette origine, le
  // navigateur refuse CHAQUE image du document traduit — c'est-à-dire ce que la
  // fonctionnalité existe pour préserver — et le lecteur n'obtient que des
  // icônes cassées, qu'il enregistre telles quelles dans son PDF.
  `img-src 'self' data: blob: https://cdn.sanity.io https://*.convex.cloud${extra(convexOrigins.img)}`,
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline' https://www.google.com https://www.gstatic.com${isDev ? " 'unsafe-eval'" : ''}`,
  // Replays (F-54, chantier « contenus ») : lecteurs YouTube — domaine
  // « nocookie », sans traceur avant lecture — et Vimeo. Seules ces deux
  // origines : l'adresse intégrée est recalculée côté serveur à partir d'un
  // lien validé contre sa plateforme, jamais recopiée telle que saisie.
  "frame-src 'self' https://www.google.com https://www.youtube-nocookie.com https://player.vimeo.com",
  // Replays en FICHIER vidéo (mp4, webm…) hébergés hors du site : https
  // uniquement, contrôlé à la saisie (`validateVideoUrl`).
  "media-src 'self' https:",
  `connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://*.convex.site https://*.sanity.io wss://*.sanity.io https://www.google.com${extra(convexOrigins.connect)}${isDev ? ' ws://localhost:* http://localhost:*' : ''}`,
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
  // `X-Powered-By: Next.js` n'apprend rien à l'utilisateur et quelque chose à
  // l'attaquant (relevé le 27/09, en-têtes de sécurité).
  poweredByHeader: false,
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
