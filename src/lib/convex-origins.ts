// Origines à ouvrir dans la CSP pour le déploiement Convex CONFIGURÉ.
//
// POURQUOI. La CSP de `next.config.ts` n'ouvrait que `*.convex.cloud`. C'est
// juste pour le cloud Convex, et faux pour tout autre déploiement : un backend
// AUTO-HÉBERGÉ (l'option souveraineté UE que le backlog met sur la table) ou un
// déploiement LOCAL (`npx convex dev --local` -> http://127.0.0.1:3210). Dans
// ces deux cas, le navigateur refuse le websocket de synchronisation, et rien
// ne le dit à l'utilisateur : le bouton « Se connecter » passe en attente et y
// reste. Mesuré lors de la campagne de tests du 27/09/2026 : la suite E2E
// entière tombait dès l'ouverture des sessions, sur un backend local.
//
// CE QUE ÇA OUVRE. Seulement l'origine que le déploiement déclare lui-même —
// `NEXT_PUBLIC_CONVEX_URL` est lue au build, comme le client Convex la lit. Un
// déploiement `*.convex.cloud` n'ajoute rien : le joker existant le couvre déjà
// et la CSP de production reste, à l'octet près, celle d'avant.
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
  // `img-src` aussi : le stockage (`ctx.storage.getUrl()`) sert les
  // illustrations des PDF depuis la même origine que l'API.
  return { connect: [http, ws], img: [http] };
}
