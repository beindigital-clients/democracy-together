// Time-based one-time passwords — RFC 6238 (TOTP) on top of RFC 4226 (HOTP),
// HMAC-SHA1, 6 digits, 30 s step: the parameters ALL authenticator apps
// understand (Google Authenticator, Aegis, FreeOTP, 1Password…). Changing one
// means losing some of them — hence constants and not settings.
//
// PURE module, no dependency: Web Crypto (`crypto.subtle`) only. It therefore
// runs identically in a Convex action, in Node (the E2E spec computes the
// code with THIS function, not a copy) and in the browser. The tests replay
// the vectors from appendix B of RFC 6238.
//
// This module reads neither the time nor randomness itself: the caller
// provides them. That is what makes the RFC vectors replayable as is.

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
// Clock tolerance: the current step and ONE step on either side (±30 s).
// Beyond that, an intercepted code lives longer; below that, a phone whose
// clock drifts by a few seconds fails at the wrong moment.
export const TOTP_WINDOW = 1;
// 160 bits: the output size of SHA-1, recommended by RFC 4226 § 4.
export const TOTP_SECRET_BYTES = 20;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Base32 RFC 4648, without padding — the form expected by `otpauth://`. */
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

/** Decodes Base32; tolerates spaces, hyphens, lowercase and padding. */
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

/** Time step (counter) for a given instant in milliseconds. */
export function timeStep(
  nowMs: number,
  periodSeconds: number = TOTP_PERIOD_SECONDS,
): number {
  return Math.floor(nowMs / 1000 / periodSeconds);
}

// 8-byte big-endian counter (RFC 4226 § 5.1). JavaScript bitwise operations
// are 32-bit: the high half is computed by division to stay correct beyond
// 2^32 (the RFC's year-2603 vector needs it).
function counterBytes(counter: number): Uint8Array {
  const buf = new Uint8Array(8);
  const high = Math.floor(counter / 0x1_0000_0000);
  const low = counter >>> 0;
  new DataView(buf.buffer).setUint32(0, high);
  new DataView(buf.buffer).setUint32(4, low);
  return buf;
}

/** HOTP (RFC 4226): HMAC-SHA1 then dynamic truncation. */
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

/** TOTP (RFC 6238) for the instant `nowMs`. */
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

/** Constant-time comparison of two strings over the same alphabet. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Keeps the only accepted form of an entered code: six digits. */
export function normalizeTotpCode(input: string): string | null {
  const digits = input.replace(/[\s-]/g, '');
  return /^\d{6}$/.test(digits) ? digits : null;
}

/**
 * The time step `code` matches, or `null`.
 *
 * `afterStep` prevents REPLAY: a step lower than or equal to the last step
 * accepted for this account is refused, even if the code is correct. Without
 * this, a code read over someone's shoulder would stay valid for up to 90 s.
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
  // The whole window is computed even after a match: the response time does not
  // reveal which step the code matched.
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
 * Enrolment URI (Google Authenticator "Key Uri" format), the one carried by
 * the QR code. The issuer is repeated as a parameter: some apps only read
 * that.
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

// --- Backup codes ------------------------------------------------------------
//
// Ten codes of ten characters, with an alphabet free of ambiguous characters
// (no 0/O, no 1/I/L): they are copied by hand, often from paper. 32^10 ≈ 2^50
// per code — out of reach of rate-limited online guessing.

const BACKUP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_LENGTH = 10;

/**
 * Generates backup codes from the supplied random bytes.
 *
 * UNBIASED DRAW (CodeQL alert of 27/09): a byte is 0 to 255, and 256 is not a
 * multiple of 31 — a plain `% 31` favours the first nine symbols. We therefore
 * REJECT bytes ≥ 248 (largest multiple of 31 below 256): each kept byte
 * yields a uniform symbol. Consequently more bytes than symbols are needed;
 * `BACKUP_RANDOM_BYTES` supplies twice as many, and running out (negligible
 * probability) throws an error rather than producing a shorter code.
 */
export function backupCodesFromBytes(random: Uint8Array): string[] {
  const alphabetSize = BACKUP_ALPHABET.length;
  const limit = 256 - (256 % alphabetSize);
  let cursor = 0;
  const nextSymbol = (): string => {
    while (cursor < random.length) {
      const byte = random[cursor++];
      if (byte < limit) return BACKUP_ALPHABET[byte % alphabetSize];
    }
    throw new Error('NOT_ENOUGH_RANDOMNESS');
  };
  const codes: string[] = [];
  for (let c = 0; c < BACKUP_CODE_COUNT; c++) {
    let code = '';
    for (let i = 0; i < BACKUP_CODE_LENGTH; i++) code += nextSymbol();
    codes.push(`${code.slice(0, 5)}-${code.slice(5)}`);
  }
  return codes;
}

/** Random bytes to supply: twice the symbols, to allow for rejection. */
export const BACKUP_RANDOM_BYTES = BACKUP_CODE_COUNT * BACKUP_CODE_LENGTH * 2;

/** Canonical form of an entered backup code, or `null`. */
export function normalizeBackupCode(input: string): string | null {
  const clean = input.toUpperCase().replace(/[\s-]/g, '');
  if (clean.length !== BACKUP_CODE_LENGTH) return null;
  for (const char of clean) {
    if (!BACKUP_ALPHABET.includes(char)) return null;
  }
  return clean;
}

/** SHA-256 hash in hexadecimal. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
