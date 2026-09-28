// Chiffrement AU REPOS des secrets de double authentification.
//
// Un secret TOTP en clair dans la base, c'est le second facteur de chaque
// compte offert à quiconque lit une sauvegarde, un export de la base ou le
// tableau de bord Convex. Il est donc chiffré en AES-256-GCM avec une clé qui
// n'est PAS dans la base : la variable d'environnement
// `TWO_FACTOR_ENCRYPTION_KEY` (32 octets en base64 — `openssl rand -base64 32`).
//
// L'identifiant du compte est passé en DONNÉE ASSOCIÉE (AAD) : un secret
// recopié d'une ligne à l'autre par quelqu'un qui peut écrire en base ne se
// déchiffre plus. Le vol d'une ligne ne sert pas à un autre compte.
//
// SANS CLÉ, fail-closed : l'inscription à la 2FA est refusée
// (TWO_FACTOR_KEY_NOT_CONFIGURED) et l'écran le dit. Seule exception, le
// déploiement de DÉVELOPPEMENT (`AUTH_DEV_OTP=true`, jamais en production —
// TESTING.md) : une clé dérivée d'une constante publique, marquée `dev`, pour
// que la spec E2E puisse inscrire un appareil. Un secret `dev` est refusé dès
// que le déploiement porte une vraie clé.
//
// Ce module ne s'exécute que dans des ACTIONS : Web Crypto et le hasard vrai y
// sont disponibles, ce qui n'est pas garanti dans une mutation.

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
    // Clé de développement : refusée dès qu'une vraie clé existe, et hors
    // d'un déploiement de développement.
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

/** Clé à employer pour un NOUVEAU secret, ou erreur si aucune n'est admise. */
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
  // Une clé absente ou mal formée lève ici, avec son propre code : c'est une
  // erreur de CONFIGURATION, que l'exploitant doit pouvoir distinguer.
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
    // Mauvaise clé (rotation sans rechiffrement) ou ligne altérée — y compris
    // un secret recopié sur un autre compte (donnée associée différente).
    throw new Error('TWO_FACTOR_SECRET_UNREADABLE');
  }
}
