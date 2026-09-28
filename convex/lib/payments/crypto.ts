// Primitives cryptographiques des paiements — Web Crypto uniquement.
//
// Web Crypto existe dans le runtime Convex par défaut (V8), dans les actions
// HTTP et dans l'environnement de test edge-runtime : aucun `"use node"`, aucun
// SDK de prestataire. C'est ce qui permet de vérifier une signature de webhook
// dans l'action HTTP elle-même.

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hmacSha256Hex(
  secret: string,
  payload: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
}

/**
 * Comparaison à temps constant de deux chaînes.
 *
 * Une comparaison `===` s'arrête au premier caractère différent : le temps de
 * réponse dit alors combien de caractères d'une signature forgée sont justes,
 * et la signature se devine octet par octet. La longueur, elle, n'est pas un
 * secret (une signature hexadécimale a toujours la même).
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Jeton aléatoire hexadécimal (référence de paiement, lien de reçu). */
export function randomToken(bytes = 16): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
