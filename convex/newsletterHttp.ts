import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import { SITE_LOCALES, type SiteLocale } from './lib/locales';
import { siteUrl } from './lib/newsletterContent';

// DÉSINSCRIPTION « EN UN CLIC » (RFC 8058) — cible de l'en-tête
// `List-Unsubscribe` de chaque campagne (chantier diffusion, F-65).
//
// Deux usages, une adresse :
//  - POST `List-Unsubscribe=One-Click` : le bouton « Se désabonner » que
//    Gmail, Yahoo ou Apple Mail affichent au-dessus du message. Il DOIT
//    désinscrire sans autre étape ni page à visiter ; il ne suit pas de
//    redirection et n'affiche rien.
//  - GET : un client qui ouvre le lien dans le navigateur. On ne désinscrit
//    PAS sur un GET — les antivirus de messagerie pré-chargent les liens, et
//    un simple aperçu désinscrirait l'abonné —, on redirige vers la page de
//    désinscription, dans la langue de l'abonné, qui fait la même opération
//    au vu de l'utilisateur.
//
// Module séparé de `http.ts` (qui monte aussi Convex Auth et n'est pas chargé
// par les tests) : la décision vit dans `newsletter.unsubscribeByToken`,
// testée directement.

function langOf(raw: string | null): SiteLocale {
  return (SITE_LOCALES as readonly string[]).includes(raw ?? '')
    ? (raw as SiteLocale)
    : 'fr';
}

function tokenOf(url: URL): string {
  const token = url.searchParams.get('token') ?? '';
  // Jeton de désinscription : 32 caractères hexadécimaux. Tout le reste est
  // refusé avant la moindre lecture en base.
  return /^[0-9a-f]{32}$/.test(token) ? token : '';
}

export const unsubscribeOneClick = httpAction(async (ctx, req) => {
  const token = tokenOf(new URL(req.url));
  if (!token) return new Response('Bad Request', { status: 400 });
  const result = await ctx.runMutation(internal.newsletter.unsubscribeByToken, {
    token,
  });
  // 200 même pour un jeton inconnu (déjà désinscrit) : le client de
  // messagerie n'a rien d'autre à faire, et la réponse ne distingue pas un
  // abonné d'un autre.
  return new Response(result.ok ? 'OK' : 'Bad Request', {
    status: result.ok ? 200 : 400,
  });
});

export const unsubscribeRedirect = httpAction(async (_ctx, req) => {
  const url = new URL(req.url);
  const token = tokenOf(url);
  const loc = langOf(url.searchParams.get('l'));
  const target = `${siteUrl()}/${loc}/newsletter/desinscription${
    token ? `?token=${token}` : ''
  }`;
  return new Response(null, { status: 302, headers: { Location: target } });
});
