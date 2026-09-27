// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import {
  backupCodesFromBytes,
  base32Decode,
  base32Encode,
  hotp,
  matchTotpStep,
  normalizeBackupCode,
  normalizeTotpCode,
  otpauthUri,
  timeStep,
  totp,
  BACKUP_CODE_COUNT,
} from './lib/totp';
import { openSecret, sealSecret } from './lib/secretBox';
import { vi, afterEach } from 'vitest';

// Clé des vecteurs de la RFC 6238 (annexe B), mode SHA-1 : les vingt octets
// ASCII de « 12345678901234567890 ».
const RFC_KEY = new TextEncoder().encode('12345678901234567890');

describe('TOTP — vecteurs de la RFC 6238 (annexe B, SHA-1, 8 chiffres)', () => {
  const VECTORS: [number, string][] = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    // Au-delà de 2^32 secondes / 30 : le compteur déborde 32 bits.
    [20000000000, '65353130'],
  ];
  for (const [seconds, expected] of VECTORS) {
    it(`T = ${seconds} s -> ${expected}`, async () => {
      expect(await totp(RFC_KEY, seconds * 1000, { digits: 8 })).toBe(expected);
    });
  }

  it('HOTP (RFC 4226, annexe D) : compteurs 0 et 9', async () => {
    expect(await hotp(RFC_KEY, 0)).toBe('755224');
    expect(await hotp(RFC_KEY, 9)).toBe('520489');
  });
});

describe('TOTP — fenêtre et rejeu', () => {
  const now = 1_700_000_000_000;

  it('accepte le pas courant et un pas de part et d’autre, pas au-delà', async () => {
    const step = timeStep(now);
    for (const delta of [-1, 0, 1]) {
      const code = await hotp(RFC_KEY, step + delta);
      expect(await matchTotpStep(RFC_KEY, code, now)).toBe(step + delta);
    }
    for (const delta of [-3, 2]) {
      const code = await hotp(RFC_KEY, step + delta);
      // Un code d'un pas éloigné peut coïncider par hasard avec un code de la
      // fenêtre (1 chance sur un million) : on ne vérifie que l'absence du
      // pas lointain.
      expect(await matchTotpStep(RFC_KEY, code, now)).not.toBe(step + delta);
    }
  });

  it('refuse un code JUSTE mais déjà utilisé (afterStep)', async () => {
    const code = await totp(RFC_KEY, now);
    const step = timeStep(now);
    expect(await matchTotpStep(RFC_KEY, code, now, { afterStep: step })).toBe(
      null,
    );
    expect(
      await matchTotpStep(RFC_KEY, code, now, { afterStep: step - 1 }),
    ).toBe(step);
  });

  it('ne garde que six chiffres (espaces et tirets tolérés)', () => {
    expect(normalizeTotpCode('123 456')).toBe('123456');
    expect(normalizeTotpCode('123-456')).toBe('123456');
    expect(normalizeTotpCode('12345')).toBe(null);
    expect(normalizeTotpCode('abcdef')).toBe(null);
  });
});

describe('Base32 et URI d’inscription', () => {
  it('fait l’aller-retour et suit la RFC 4648', () => {
    expect(base32Encode(new TextEncoder().encode('foobar'))).toBe('MZXW6YTBOI');
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
    expect(() => base32Decode('1!')).toThrow('INVALID_BASE32');
  });

  it('produit une URI otpauth lisible par les applications', () => {
    const uri = otpauthUri({
      secretBase32: 'JBSWY3DPEHPK3PXP',
      account: 'membre@exemple.org',
      issuer: 'Democracy Together',
    });
    expect(uri.startsWith('otpauth://totp/Democracy%20Together%3A')).toBe(true);
    const params = new URL(uri).searchParams;
    expect(params.get('secret')).toBe('JBSWY3DPEHPK3PXP');
    expect(params.get('digits')).toBe('6');
    expect(params.get('period')).toBe('30');
    expect(params.get('algorithm')).toBe('SHA1');
  });
});

describe('Codes de secours', () => {
  it('en produit dix, lisibles et normalisables', () => {
    const codes = backupCodesFromBytes(
      crypto.getRandomValues(new Uint8Array(100)),
    );
    expect(codes).toHaveLength(BACKUP_CODE_COUNT);
    for (const c of codes) {
      expect(c).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
      expect(normalizeBackupCode(c.toLowerCase())).toBe(c.replace('-', ''));
    }
    expect(normalizeBackupCode('0OIL1-00000')).toBe(null);
  });
});

describe('Chiffrement au repos du secret', () => {
  afterEach(() => vi.unstubAllEnvs());
  const KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));

  it('chiffre, déchiffre, et lie le secret à son compte (AAD)', async () => {
    vi.stubEnv('TWO_FACTOR_ENCRYPTION_KEY', KEY);
    const secret = crypto.getRandomValues(new Uint8Array(20));
    const sealed = await sealSecret(secret, 'user-a');
    expect(sealed.keyId).toBe('env');
    expect(sealed.ciphertext).not.toContain(base32Encode(secret));
    expect(await openSecret(sealed, 'user-a')).toEqual(secret);
    await expect(openSecret(sealed, 'user-b')).rejects.toThrow(
      'TWO_FACTOR_SECRET_UNREADABLE',
    );
  });

  it('refuse sans clé hors développement, et la clé de dev dès qu’une vraie existe', async () => {
    vi.stubEnv('TWO_FACTOR_ENCRYPTION_KEY', '');
    vi.stubEnv('AUTH_DEV_OTP', '');
    await expect(sealSecret(new Uint8Array(20), 'u')).rejects.toThrow(
      'TWO_FACTOR_KEY_NOT_CONFIGURED',
    );
    vi.stubEnv('AUTH_DEV_OTP', 'true');
    const dev = await sealSecret(new Uint8Array(20), 'u');
    expect(dev.keyId).toBe('dev');
    vi.stubEnv('TWO_FACTOR_ENCRYPTION_KEY', KEY);
    await expect(openSecret(dev, 'u')).rejects.toThrow(
      'TWO_FACTOR_KEY_NOT_CONFIGURED',
    );
  });
});
