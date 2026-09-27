// Mots de passe à usage unique basés sur le temps — RFC 6238 (TOTP) sur
// RFC 4226 (HOTP), HMAC-SHA1, 6 chiffres, pas de 30 s : les paramètres que
// TOUTES les applications d'authentification comprennent (Google
// Authenticator, Aegis, FreeOTP, 1Password…). En changer un, c'est perdre
// une partie d'entre elles — d'où des constantes et non des réglages.
//
// Module PUR, sans dépendance : Web Crypto (`crypto.subtle`) seulement. Il
// tourne donc à l'identique dans une action Convex, dans Node (la spec E2E
// calcule le code avec CETTE fonction, pas avec une copie) et dans le
// navigateur. Les tests rejouent les vecteurs de l'annexe B de la RFC 6238.
//
// Ce module ne lit ni l'heure ni le hasard lui-même : l'appelant les fournit.
// C'est ce qui rend les vecteurs de la RFC rejouables tels quels.

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
// Tolérance d'horloge : le pas courant et UN pas de part et d'autre (±30 s).
// Au-delà, un code intercepté vit plus longtemps ; en deçà, un téléphone dont
// l'horloge dérive de quelques secondes échoue au mauvais moment.
export const TOTP_WINDOW = 1;
// 160 bits : la taille de sortie de SHA-1, recommandée par la RFC 4226 § 4.
export const TOTP_SECRET_BYTES = 20;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Base32 RFC 4648, sans remplissage — la forme attendue par `otpauth://`. */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

/** Décode du Base32 ; tolère espaces, tirets, minuscules et remplissage. */
export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = BASE32.indexOf(char);
    if (idx === -1) throw new Error('INVALID_BASE32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** Pas de temps (compteur) pour un instant donné en millisecondes. */
export function timeStep(
  nowMs: number,
  periodSeconds: number = TOTP_PERIOD_SECONDS,
): number {
  return Math.floor(nowMs / 1000 / periodSeconds);
}

// Compteur sur 8 octets gros-boutiste (RFC 4226 § 5.1). Les opérations
// binaires de JavaScript sont sur 32 bits : la moitié haute se calcule par
// division pour rester juste au-delà de 2^32 (le vecteur de l'an 2603 de la
// RFC en a besoin).
function counterBytes(counter: number): Uint8Array {
  const buf = new Uint8Array(8);
  const high = Math.floor(counter / 0x1_0000_0000);
  const low = counter >>> 0;
  new DataView(buf.buffer).setUint32(0, high);
  new DataView(buf.buffer).setUint32(4, low);
  return buf;
}

/** HOTP (RFC 4226) : HMAC-SHA1 puis troncature dynamique. */
export async function hotp(
  key: Uint8Array,
  counter: number,
  digits: number = TOTP_DIGITS,
): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      counterBytes(counter) as BufferSource,
    ),
  );
  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  return (binary % 10 ** digits).toString().padStart(digits, '0');
}

/** TOTP (RFC 6238) pour l'instant `nowMs`. */
export async function totp(
  key: Uint8Array,
  nowMs: number,
  options: { digits?: number; periodSeconds?: number } = {},
): Promise<string> {
  return hotp(
    key,
    timeStep(nowMs, options.periodSeconds),
    options.digits ?? TOTP_DIGITS,
  );
}

/** Comparaison en temps constant de deux chaînes de même alphabet. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Garde la seule forme admise d'un code saisi : six chiffres. */
export function normalizeTotpCode(input: string): string | null {
  const digits = input.replace(/[\s-]/g, '');
  return /^\d{6}$/.test(digits) ? digits : null;
}

/**
 * Le pas de temps auquel `code` correspond, ou `null`.
 *
 * `afterStep` interdit le REJEU : un pas inférieur ou égal au dernier pas
 * accepté pour ce compte est refusé, même si le code est juste. Sans cela, un
 * code lu par-dessus l'épaule resterait bon jusqu'à 90 s.
 */
export async function matchTotpStep(
  key: Uint8Array,
  code: string,
  nowMs: number,
  options: { window?: number; afterStep?: number } = {},
): Promise<number | null> {
  const normalized = normalizeTotpCode(code);
  if (normalized === null) return null;
  const current = timeStep(nowMs);
  const window = options.window ?? TOTP_WINDOW;
  let found: number | null = null;
  // Toute la fenêtre est calculée même après une correspondance : le temps de
  // réponse ne dit pas à quel pas le code correspondait.
  for (let step = current - window; step <= current + window; step++) {
    const candidate = await hotp(key, step);
    if (timingSafeEqual(candidate, normalized) && found === null) {
      found = step;
    }
  }
  if (found === null) return null;
  if (options.afterStep !== undefined && found <= options.afterStep) {
    return null;
  }
  return found;
}

/**
 * URI d'inscription (format « Key Uri » de Google Authenticator), celle que
 * porte le QR code. L'émetteur est répété en paramètre : certaines
 * applications ne lisent que lui.
 */
export function otpauthUri({
  secretBase32,
  account,
  issuer,
}: {
  secretBase32: string;
  account: string;
  issuer: string;
}): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// --- Codes de secours --------------------------------------------------------
//
// Dix codes de dix caractères, alphabet sans caractères ambigus (ni 0/O, ni
// 1/I/L) : ils se recopient à la main, souvent depuis un papier. 32^10 ≈ 2^50
// par code — hors de portée d'un essai en ligne limité en débit.

const BACKUP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_LENGTH = 10;

/** Génère les codes de secours à partir d'octets aléatoires fournis. */
export function backupCodesFromBytes(random: Uint8Array): string[] {
  const needed = BACKUP_CODE_COUNT * BACKUP_CODE_LENGTH;
  if (random.length < needed) throw new Error('NOT_ENOUGH_RANDOMNESS');
  const codes: string[] = [];
  for (let c = 0; c < BACKUP_CODE_COUNT; c++) {
    let code = '';
    for (let i = 0; i < BACKUP_CODE_LENGTH; i++) {
      // 256 n'est pas multiple de 31 : le biais (< 1 %) est négligeable pour
      // un code à usage unique limité en débit.
      code += BACKUP_ALPHABET[random[c * BACKUP_CODE_LENGTH + i] % 31];
    }
    codes.push(`${code.slice(0, 5)}-${code.slice(5)}`);
  }
  return codes;
}

/** Forme canonique d'un code de secours saisi, ou `null`. */
export function normalizeBackupCode(input: string): string | null {
  const clean = input.toUpperCase().replace(/[\s-]/g, '');
  if (clean.length !== BACKUP_CODE_LENGTH) return null;
  for (const char of clean) {
    if (!BACKUP_ALPHABET.includes(char)) return null;
  }
  return clean;
}

/** Empreinte SHA-256 en hexadécimal. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
