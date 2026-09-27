// ENVOI EN VOLUME D'UNE CAMPAGNE (F-65) — réglages et règles pures.

import { RESEND_BATCH_MAX } from '../email';

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

function envNumber(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

// Taille d'un lot : 50 par défaut, jamais plus que ce que l'API batch accepte.
export const DEFAULT_BATCH_SIZE = 50;
// Débit par défaut : 600 courriels/minute, soit un lot de 50 toutes les 5 s —
// bien sous la limite de requêtes de Resend (2/s), et assez lent pour qu'une
// réputation d'expéditeur neuve ne soit pas grillée par un pic.
export const DEFAULT_RATE_PER_MINUTE = 600;

export type DeliveryConfig = {
  batchSize: number;
  ratePerMinute: number;
  /** Pause entre deux lots, dérivée du débit. */
  intervalMs: number;
};

/**
 * Réglages lus sur le déploiement — `NEWSLETTER_BATCH_SIZE` et
 * `NEWSLETTER_RATE_PER_MINUTE`. Lus à chaque lot : modifier la variable
 * ralentit une campagne EN COURS, sans redéploiement.
 */
export function deliveryConfig(): DeliveryConfig {
  const batchSize = Math.round(
    clamp(
      envNumber('NEWSLETTER_BATCH_SIZE') ?? DEFAULT_BATCH_SIZE,
      1,
      RESEND_BATCH_MAX,
    ),
  );
  const ratePerMinute = clamp(
    envNumber('NEWSLETTER_RATE_PER_MINUTE') ?? DEFAULT_RATE_PER_MINUTE,
    1,
    6000,
  );
  const intervalMs = Math.max(
    200,
    Math.round((batchSize / ratePerMinute) * 60_000),
  );
  return { batchSize, ratePerMinute, intervalMs };
}

// Un lot pris en charge et resté « en cours » plus longtemps que ce bail est
// considéré interrompu (action coupée, déploiement) : il est REPRIS, avec la
// même clé d'idempotence.
export const CLAIM_LEASE_MS = 5 * 60 * 1000;

// Au-delà de trois échecs TRANSITOIRES d'affilée sur le même lot, les lignes
// passent en échec : l'éditeur les relancera quand le fournisseur répondra.
// LIMITE ASSUMÉE : la relance forme de nouveaux lots, donc de nouvelles clés
// d'idempotence. Si l'un des trois appels ambigus (réseau coupé après envoi)
// avait en réalité abouti, ce destinataire peut recevoir un doublon. Le cas
// exige trois coupures consécutives sur le même lot ; il est préféré à une
// campagne bloquée sans fin sur un lot qu'on ne saurait pas trancher.
export const MAX_TRANSIENT_ATTEMPTS = 3;

/** Clé d'idempotence transmise au fournisseur pour un lot. */
export function idempotencyKey(claimId: string): string {
  return `dt-newsletter:${claimId}`;
}

/** Recul exponentiel après un échec transitoire (borné à 10 min). */
export function backoffMs(attempt: number, intervalMs: number): number {
  return Math.min(10 * 60 * 1000, intervalMs * 2 ** Math.max(1, attempt));
}
