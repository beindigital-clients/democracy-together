import { ConvexError } from 'convex/values';
import type { MutationCtx } from '../_generated/server';

// Limiteur de débit (sécurité — défense en profondeur) contre le spam / abus
// sur les endpoints publics. Profil de menace : pics pendant un sommet,
// contributeurs en zones sensibles. Fenêtre FIXE : un compteur par clé, remis à
// zéro quand la fenêtre est dépassée.
//
// Clé = identifiant d'acteur : e-mail pour les endpoints anonymes (contact,
// adhésion), userId pour les endpoints authentifiés (dépôt, upload).
//
// LIMITES : la clé e-mail est FOURNIE PAR L'APPELANT, donc forgeable — faire
// varier l'adresse rend un quota neuf (audit M2, issue #24). Elle borne un
// acteur honnête, pas un script. Les plafonds non forgeables (par IP, et global
// par formulaire) vivent plus bas dans ce fichier : `enforcePublicFormLimit`.
//
// Sur dépassement : ConvexError('RATE_LIMITED') — `data` traverse jusqu'au
// client (contrairement à un Error nu, masqué en prod), pour un message dédié.
export type RateLimitRule = { key: string; max: number; windowMs: number };

export async function enforceRateLimit(
  ctx: MutationCtx,
  rule: RateLimitRule,
): Promise<void> {
  if (!(await consumeRateLimit(ctx, rule))) {
    throw new ConvexError('RATE_LIMITED');
  }
}

// Variante NON bloquante : consomme un jeton et dit s'il en restait, au lieu de
// lever. Pour les appels où dépasser le quota n'est pas une erreur à remonter à
// l'utilisateur mais une action à ne pas compter (cf. recordPublicationView :
// une consultation de trop ne doit rien casser dans la page, juste ne pas
// compter). `enforceRateLimit` est cette fonction + un throw.
export async function consumeRateLimit(
  ctx: MutationCtx,
  { key, max, windowMs }: RateLimitRule,
): Promise<boolean> {
  const now = Date.now();
  const existing = await ctx.db
    .query('rateLimits')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();

  if (!existing) {
    await ctx.db.insert('rateLimits', { key, count: 1, windowStart: now });
    return true;
  }
  if (now - existing.windowStart >= windowMs) {
    // Fenêtre expirée -> nouvelle fenêtre.
    await ctx.db.patch(existing._id, { count: 1, windowStart: now });
    return true;
  }
  if (existing.count >= max) {
    return false;
  }
  await ctx.db.patch(existing._id, { count: existing.count + 1 });
  return true;
}

const HOUR = 60 * 60 * 1000;

// Barèmes centralisés (généreux : un usage humain normal ne les atteint pas).
export const RATE_LIMITS = {
  contact: { max: 5, windowMs: HOUR },
  apply: { max: 5, windowMs: HOUR },
  newsletter: { max: 5, windowMs: HOUR },
  // Envoi de codes OTP / vérification / reset par e-mail (anti email-bombing :
  // l'envoi part vers une adresse fournie par l'appelant). Généreux pour un
  // usage humain (inscription + un renvoi + reset), strict contre l'abus.
  otpSend: { max: 8, windowMs: HOUR },
  eventRegister: { max: 10, windowMs: HOUR },
  tribunePost: { max: 10, windowMs: HOUR },
  tribuneComment: { max: 40, windowMs: HOUR },
  tribuneReport: { max: 20, windowMs: HOUR },
  publicationSubmit: { max: 10, windowMs: 24 * HOUR },
  projectSubmit: { max: 5, windowMs: 24 * HOUR },
  workspaceCreate: { max: 10, windowMs: 24 * HOUR },
  workspaceNote: { max: 60, windowMs: HOUR },
  upload: { max: 30, windowMs: HOUR },
} as const;

// --- Plafonds NON FORGEABLES (audit M2, issue #24) ---------------------------
//
// Les barèmes ci-dessus sont indexés sur une donnée du formulaire (l'e-mail) :
// un script qui fait varier l'adresse obtient un quota neuf à chaque requête, et
// remplit la table à volonté. Deux plafonds supplémentaires, qui ne dépendent
// d'AUCUNE donnée du corps de la requête, ferment ce trou :
//
//  1. PAR IP — Convex 1.42 expose les métadonnées de la requête HTTP aux
//     mutations comme aux actions : `ctx.meta.getRequestMetadata()` rend
//     `{ ip, userAgent, requestId, scheduledFunctionId }`. L'IP est celle vue
//     par l'infrastructure Convex, pas un champ du payload : l'appelant ne peut
//     pas la choisir. Point clé pour ce dépôt : une fonction appelée par
//     `runMutation` HÉRITE des métadonnées de son appelant — l'internalMutation
//     métier voit donc l'IP du client qui a appelé l'action-portail, sans qu'on
//     ait à faire transiter l'adresse en argument (ce qui l'aurait rendue…
//     fournie par l'appelant, et le problème serait resté entier).
//
//  2. GLOBAL PAR FORMULAIRE — un compteur unique par formulaire, sans clé du
//     tout. Dernier rempart : il tient même derrière un pool d'adresses
//     (botnet, proxies, NAT opérateur) et quand l'IP n'est pas disponible.
//
// COMPROMIS assumé du plafond global : il est atteignable par un attaquant, et
// bloque alors les soumissions légitimes jusqu'à la fin de la fenêtre. C'est un
// déni de service borné dans le temps, préféré à un remplissage illimité de la
// base. Il est donc réglé LARGE — le plafond par IP arrête un attaquant à source
// unique bien avant —, et le blindage réseau reste l'affaire de la couche edge.
//
// Les deux compteurs vivent dans la même table `rateLimits`, dans des espaces de
// noms distincts (`ip:<formulaire>:<adresse>` et `form:<formulaire>`) : aucune
// collision possible avec les clés e-mail/userId existantes.

type PublicFormLimit = {
  perIp: { max: number; windowMs: number };
  global: { max: number; windowMs: number };
};

// Barèmes par formulaire public (les sept tables que l'audit relève comme
// exposées au remplissage). Généreux à dessein : un usage humain normal, même
// en pic de sommet et même derrière un NAT partagé, ne les atteint pas.
export const PUBLIC_FORM_LIMITS = {
  contact: {
    perIp: { max: 20, windowMs: HOUR },
    global: { max: 200, windowMs: HOUR },
  },
  apply: {
    perIp: { max: 20, windowMs: HOUR },
    global: { max: 100, windowMs: HOUR },
  },
  newsletter: {
    perIp: { max: 30, windowMs: HOUR },
    global: { max: 500, windowMs: HOUR },
  },
  eventRegister: {
    perIp: { max: 30, windowMs: HOUR },
    global: { max: 500, windowMs: HOUR },
  },
  eventReminder: {
    perIp: { max: 30, windowMs: HOUR },
    global: { max: 500, windowMs: HOUR },
  },
  youthApply: {
    perIp: { max: 20, windowMs: HOUR },
    global: { max: 200, windowMs: HOUR },
  },
  mentorship: {
    perIp: { max: 20, windowMs: HOUR },
    global: { max: 200, windowMs: HOUR },
  },
} satisfies Record<string, PublicFormLimit>;

export type PublicForm = keyof typeof PUBLIC_FORM_LIMITS;

// Regroupe une adresse en « bloc facturable » avant d'en faire une clé.
//
// IPv4 : l'adresse entière. IPv6 : le /64 — un opérateur délègue couramment un
// préfixe entier à un seul abonné, qui peut donc changer d'adresse à volonté à
// l'intérieur du bloc. Compter par adresse complète rendrait le plafond par IP
// gratuit à contourner en IPv6. Les formes abrégées (`2001:db8::1`) et les
// adresses IPv4 encapsulées (`::ffff:203.0.113.7`) sont ramenées à la même
// forme que leur équivalent direct, pour qu'un même client ne compte pas deux
// fois selon la façon dont l'infrastructure a écrit son adresse.
export function ipBucket(raw: string): string {
  const ip = raw.trim().toLowerCase();
  if (!ip) return '';
  if (!ip.includes(':')) return ip; // IPv4

  // IPv4 encapsulée en IPv6 (::ffff:a.b.c.d) -> on garde l'IPv4.
  const mapped = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (mapped) return mapped[1];

  // Développe l'abréviation `::` en 8 hextets, puis garde les 4 premiers.
  const [head, tail] = ip.split('::');
  const left = head ? head.split(':') : [];
  const right = ip.includes('::') && tail ? tail.split(':') : [];
  const hextets = ip.includes('::')
    ? [
        ...left,
        ...Array<string>(Math.max(8 - left.length - right.length, 0)).fill('0'),
        ...right,
      ]
    : left;

  const prefix = hextets
    .slice(0, 4)
    .map((h) => h.replace(/^0+/, '') || '0')
    .join(':');
  return `${prefix}::/64`;
}

// Lit l'IP de l'appelant telle que l'infrastructure Convex l'a vue.
//
// `ctx.meta` n'existe pas partout : convex-test ne le simule pas, et un
// déploiement plus ancien ne l'expose pas. On dégrade alors proprement vers le
// seul plafond global plutôt que de faire échouer toutes les soumissions. `ip`
// est aussi `null` par contrat quand l'exécution ne vient pas d'une requête
// HTTP (cron, fonction planifiée).
export async function callerIpBucket(ctx: MutationCtx): Promise<string | null> {
  try {
    const meta = ctx.meta as MutationCtx['meta'] | undefined;
    if (typeof meta?.getRequestMetadata !== 'function') return null;
    const { ip } = await meta.getRequestMetadata();
    if (!ip) return null;
    const bucket = ipBucket(ip);
    return bucket || null;
  } catch {
    return null;
  }
}

// Garde à poser dans CHAQUE internalMutation d'un formulaire public, à côté du
// plafond par e-mail (qui reste utile : il borne un acteur honnête et rend un
// message clair). Les deux compteurs sont incrémentés dans la transaction de
// l'écriture : une soumission finalement rejetée — par la validation, par un
// autre plafond — est intégralement annulée et ne consomme donc aucun quota.
export async function enforcePublicFormLimit(
  ctx: MutationCtx,
  form: PublicForm,
): Promise<void> {
  const limits = PUBLIC_FORM_LIMITS[form];
  const bucket = await callerIpBucket(ctx);
  if (bucket) {
    await enforceRateLimit(ctx, {
      key: `ip:${form}:${bucket}`,
      ...limits.perIp,
    });
  }
  await enforceRateLimit(ctx, { key: `form:${form}`, ...limits.global });
}

// --- Consultations de publication (F-37, issue #8) ---------------------------
//
// `recordPublicationView` est une mutation PUBLIQUE et NON AUTHENTIFIÉE : sans
// plafond, le compteur de consultations se gonfle avec une boucle `for`. Il n'y
// a ici ni e-mail ni userId à prendre pour clé — seule l'IP vue par
// l'infrastructure est non forgeable.
//
// UNE SEULE ligne de quota par appel, et volontairement : la raison d'être du
// découpage `publicationViews` est de retirer de la contention d'écriture, pas
// d'en réintroduire sur trois compteurs de débit. La clé retenue est la plus
// ciblée possible — (bloc d'adresses, publication) : elle rend l'inflation
// d'UNE publication par UN acteur inopérante, sans qu'un plafond partagé puisse
// bloquer le comptage des autres publications ou des autres lecteurs.
//
// Large à dessein : un lecteur humain enregistre une consultation par
// publication et par session (dédoublonnage en sessionStorage côté client), et
// un bloc d'adresses peut légitimement abriter un campus entier.
//
// SANS IP (`ctx.meta` absent : convex-test, déploiement antérieur à Convex
// 1.42, exécution planifiée), on se rabat sur un plafond par publication. Il est
// atteignable par un attaquant, qui fige alors le compteur de CETTE publication
// jusqu'à la fin de la fenêtre : un décompte d'affichage qui stagne, préféré à
// un décompte inventé.
export const VIEW_LIMITS = {
  perIpAndPublication: { max: 60, windowMs: HOUR },
  perPublicationWithoutIp: { max: 1000, windowMs: HOUR },
} as const;

export async function consumePublicationViewQuota(
  ctx: MutationCtx,
  slug: string,
): Promise<boolean> {
  const bucket = await callerIpBucket(ctx);
  return bucket
    ? await consumeRateLimit(ctx, {
        key: `view:${bucket}:${slug}`,
        ...VIEW_LIMITS.perIpAndPublication,
      })
    : await consumeRateLimit(ctx, {
        key: `view:noip:${slug}`,
        ...VIEW_LIMITS.perPublicationWithoutIp,
      });
}
