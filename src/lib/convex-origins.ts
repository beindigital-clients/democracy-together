// Origins to open in the CSP for the CONFIGURED Convex deployment.
//
// WHY. The CSP in `next.config.ts` only opened `*.convex.cloud`. That is
// right for Convex cloud, and wrong for any other deployment: a
// SELF-HOSTED backend (the EU sovereignty option the backlog puts on the table) or a
// LOCAL deployment (`npx convex dev --local` -> http://127.0.0.1:3210). In
// both cases, the browser rejects the sync websocket, and nothing
// tells the user: the "Se connecter" button goes into a pending state and
// stays there. Measured during the 27/09/2026 test campaign: the entire E2E suite
// went down as soon as sessions were opened, on a local backend.
//
// WHAT IT OPENS. Only the origin the deployment itself declares —
// `NEXT_PUBLIC_CONVEX_URL` is read at build time, as the Convex client reads it. A
// `*.convex.cloud` deployment adds nothing: the existing wildcard already covers it
// and the production CSP stays byte-for-byte what it was before.
export function convexCspOrigins(convexUrl: string | undefined): {
  connect: string[];
  img: string[];
} {
  if (!convexUrl) return { connect: [], img: [] };
  let url: URL;
  try {
    url = new URL(convexUrl);
  } catch {
    return { connect: [], img: [] };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { connect: [], img: [] };
  }
  if (url.hostname.endsWith('.convex.cloud')) return { connect: [], img: [] };
  const http = `${url.protocol}//${url.host}`;
  const ws = `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}`;
  // `img-src` too: storage (`ctx.storage.getUrl()`) serves the
  // PDF illustrations from the same origin as the API.
  return { connect: [http, ws], img: [http] };
}
