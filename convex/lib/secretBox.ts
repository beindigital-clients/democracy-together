// AT-REST encryption of two-factor authentication secrets.
//
// A plaintext TOTP secret in the database means every account's second
// factor handed to anyone who reads a backup, a database export or the Convex
// dashboard. It is therefore encrypted with AES-256-GCM using a key that is
// NOT in the database: the `TWO_FACTOR_ENCRYPTION_KEY` environment variable
// (32 bytes in base64 — `openssl rand -base64 32`).
//
// The account identifier is passed as ASSOCIATED DATA (AAD): a secret copied
// from one row to another by someone who can write to the database no longer
// decrypts. Stealing a row is of no use for another account.
//
// WITHOUT A KEY, fail-closed: 2FA enrolment is refused
// (TWO_FACTOR_KEY_NOT_CONFIGURED) and the screen says so. The only exception
// is the DEVELOPMENT deployment (`AUTH_DEV_OTP=true`, never in production —
// TESTING.md): a key derived from a public constant, marked `dev`, so that
// the E2E spec can enrol a device. A `dev` secret is refused as soon as the
// deployment carries a real key.
//
// This module only runs in ACTIONS: Web Crypto and true randomness are
// available there, which is not guaranteed in a mutation.

export type SecretKeyId = 'env' | 'dev';

export type SecretKeyStatus = 'configured' | 'dev' | 'none';

const DEV_KEY_MATERIAL = 'democracy-together::dev-only::two-factor-key';

export function secretKeyStatus(): SecretKeyStatus {
  if (process.env.TWO_FACTOR_ENCRYPTION_KEY) return 'configured';
  return process.env.AUTH_DEV_OTP === 'true' ? 'dev' : 'none';
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromBase64(value: string): Uint8Array {
  const s = atob(value);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function keyFor(keyId: SecretKeyId): Promise<CryptoKey> {
  let raw: Uint8Array;
  if (keyId === 'env') {
    const configured = process.env.TWO_FACTOR_ENCRYPTION_KEY;
    if (!configured) throw new Error('TWO_FACTOR_KEY_NOT_CONFIGURED');
    try {
      raw = fromBase64(configured.trim());
    } catch {
      throw new Error('TWO_FACTOR_KEY_INVALID');
    }
    if (raw.length !== 32) throw new Error('TWO_FACTOR_KEY_INVALID');
  } else {
    // Development key: refused as soon as a real key exists, and outside a
    // development deployment.
    if (secretKeyStatus() !== 'dev') {
      throw new Error('TWO_FACTOR_KEY_NOT_CONFIGURED');
    }
    raw = new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(DEV_KEY_MATERIAL),
      ),
    );
  }
  return crypto.subtle.importKey(
    'raw',
    raw as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Key to use for a NEW secret, or an error if none is allowed. */
export function currentKeyId(): SecretKeyId {
  const status = secretKeyStatus();
  if (status === 'configured') return 'env';
  if (status === 'dev') return 'dev';
  throw new Error('TWO_FACTOR_KEY_NOT_CONFIGURED');
}

export async function sealSecret(
  secret: Uint8Array,
  aad: string,
): Promise<{ ciphertext: string; iv: string; keyId: SecretKeyId }> {
  const keyId = currentKeyId();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv as BufferSource,
        additionalData: new TextEncoder().encode(aad) as BufferSource,
      },
      await keyFor(keyId),
      secret as BufferSource,
    ),
  );
  return { ciphertext: toBase64(ciphertext), iv: toBase64(iv), keyId };
}

export async function openSecret(
  sealed: { ciphertext: string; iv: string; keyId: SecretKeyId },
  aad: string,
): Promise<Uint8Array> {
  // A missing or malformed key throws here, with its own code: it is a
  // CONFIGURATION error, which the operator must be able to tell apart.
  const key = await keyFor(sealed.keyId);
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: fromBase64(sealed.iv) as BufferSource,
          additionalData: new TextEncoder().encode(aad) as BufferSource,
        },
        key,
        fromBase64(sealed.ciphertext) as BufferSource,
      ),
    );
  } catch {
    // Wrong key (rotation without re-encryption) or tampered row — including a
    // secret copied onto another account (different associated data).
    throw new Error('TWO_FACTOR_SECRET_UNREADABLE');
  }
}
