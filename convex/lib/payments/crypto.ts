// Cryptographic primitives for payments — Web Crypto only.
//
// Web Crypto exists in the default Convex runtime (V8), in HTTP actions and in
// the edge-runtime test environment: no `"use node"`, no provider SDK. That is
// what makes it possible to verify a webhook signature inside the HTTP action
// itself.

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
 * Constant-time comparison of two strings.
 *
 * A `===` comparison stops at the first differing character: the response
 * time then reveals how many characters of a forged signature are correct,
 * and the signature can be guessed byte by byte. The length, however, is not
 * a secret (a hex signature always has the same one).
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Random hex token (payment reference, receipt link). */
export function randomToken(bytes = 16): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
