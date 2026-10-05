import { describe, it, expect } from 'vitest';
import {
  FINGERPRINT_K,
  FINGERPRINT_W,
  distinctHashes,
  fingerprintWords,
  fingerprintsOf,
  hashRun,
  rankSources,
} from './kohopWinnowing';
import { MIN_RUN_WORDS } from './kohopOriginality';
import { chunkText, CHUNKS_MAX, CHUNK_MAX_WORDS } from './kohopChunks';

const vocab = Array.from({ length: 400 }, (_, i) => `w${i * 7919 + 13}`);
const text = (from: number, n: number) => vocab.slice(from, from + n);

describe('Empreintes par winnowing', () => {
  it('le hachage est stable, non signé et sensible au contenu', () => {
    expect(hashRun('a b c d e')).toBe(hashRun('a b c d e'));
    expect(hashRun('a b c d e')).not.toBe(hashRun('a b c d f'));
    expect(hashRun('a b c d e')).toBeGreaterThanOrEqual(0);
    expect(hashRun('a b c d e')).toBeLessThan(2 ** 32);
  });

  it('un texte de moins de 5 mots n’a aucune empreinte', () => {
    expect(fingerprintWords(text(0, FINGERPRINT_K - 1))).toEqual([]);
  });

  it('un texte court garde au moins une empreinte', () => {
    expect(fingerprintWords(text(0, FINGERPRINT_K + 1))).toHaveLength(1);
  });

  it('ne garde qu’une fraction des suites de mots', () => {
    const words = text(0, 300);
    const prints = fingerprintWords(words);
    expect(prints.length).toBeGreaterThan(0);
    expect(prints.length).toBeLessThan(words.length - FINGERPRINT_K + 1);
  });

  it('le texte identique partage toutes ses empreintes', () => {
    const a = distinctHashes(fingerprintWords(text(0, 120)));
    const b = new Set(distinctHashes(fingerprintWords(text(0, 120))));
    expect(a.every((h) => b.has(h))).toBe(true);
  });

  it('GARANTIE : toute suite commune de MIN_RUN_WORDS mots donne une empreinte commune', () => {
    // The shared run sits at every offset, among words unique to each text.
    expect(MIN_RUN_WORDS).toBeGreaterThanOrEqual(
      FINGERPRINT_K + FINGERPRINT_W - 1,
    );
    const shared = text(100, MIN_RUN_WORDS);
    for (let offsetA = 0; offsetA < 12; offsetA++) {
      for (let offsetB = 0; offsetB < 12; offsetB += 3) {
        const a = [
          ...Array.from({ length: 30 + offsetA }, (_, i) => `a${i}x${offsetA}`),
          ...shared,
          ...Array.from({ length: 30 }, (_, i) => `a-tail${i}`),
        ];
        const b = [
          ...Array.from({ length: 25 + offsetB }, (_, i) => `b${i}y${offsetB}`),
          ...shared,
          ...Array.from({ length: 40 }, (_, i) => `b-tail${i}`),
        ];
        const hb = new Set(distinctHashes(fingerprintWords(b)));
        const common = distinctHashes(fingerprintWords(a)).filter((h) =>
          hb.has(h),
        );
        expect(common.length).toBeGreaterThan(0);
      }
    }
  });

  it('deux textes sans mot commun ne partagent aucune empreinte', () => {
    const a = new Set(distinctHashes(fingerprintWords(text(0, 150))));
    const b = distinctHashes(fingerprintWords(text(200, 150)));
    expect(b.filter((h) => a.has(h))).toEqual([]);
  });

  it('fingerprintsOf normalise accents, casse et ponctuation', () => {
    const a = fingerprintsOf(
      'La Démocratie participative, en Afrique de l’Ouest : un état des lieux.',
    );
    const b = fingerprintsOf(
      'la democratie participative en afrique de l’ouest un etat des lieux',
    );
    expect(distinctHashes(a)).toEqual(distinctHashes(b));
  });
});

describe('Classement des sources candidates', () => {
  it('garde les sources qui partagent assez d’empreintes, les meilleures d’abord', () => {
    const hits = new Map<number, string[]>([
      [1, ['kohop:a', 'publication:p']],
      [2, ['kohop:a']],
      [3, ['kohop:a', 'tribune:t']],
      [4, ['publication:p']],
    ]);
    expect(rankSources(hits, { min: 2, limit: 10 })).toEqual([
      { sourceKey: 'kohop:a', shared: 3 },
      { sourceKey: 'publication:p', shared: 2 },
    ]);
  });

  it('plafonne, et ne compte qu’une fois une source répétée sur un même hachage', () => {
    const hits = new Map<number, string[]>([[1, ['x', 'x', 'x']]]);
    expect(rankSources(hits, { min: 1, limit: 5 })).toEqual([
      { sourceKey: 'x', shared: 1 },
    ]);
    const many = new Map<number, string[]>(
      Array.from(
        { length: 30 },
        (_, i) => [i, [`s${i}`]] as [number, string[]],
      ),
    );
    expect(rankSources(many, { min: 1, limit: 5 })).toHaveLength(5);
  });
});

describe('Découpage en paragraphes', () => {
  const para = (n: number, tag: string) =>
    Array.from({ length: n }, (_, i) => `${tag}${i}`).join(' ');

  it('un paragraphe par bloc de taille raisonnable', () => {
    const out = chunkText(`${para(60, 'a')}\n\n${para(80, 'b')}`);
    expect(out).toHaveLength(2);
  });

  it('fusionne les paragraphes trop courts avec le suivant', () => {
    const out = chunkText(`${para(10, 'a')}\n\n${para(30, 'b')}`);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('a0');
    expect(out[0]).toContain('b29');
  });

  it('coupe un paragraphe trop long', () => {
    const out = chunkText(para(CHUNK_MAX_WORDS * 2 + 10, 'c'));
    expect(out.length).toBeGreaterThanOrEqual(2);
    for (const chunk of out) {
      expect(chunk.split(' ').length).toBeLessThanOrEqual(CHUNK_MAX_WORDS + 40);
    }
  });

  it('ne garde rien d’un texte trop court, et borne le total', () => {
    expect(chunkText(para(5, 'z'))).toEqual([]);
    const big = Array.from({ length: CHUNKS_MAX + 20 }, (_, i) =>
      para(60, `p${i}x`),
    ).join('\n\n');
    expect(chunkText(big)).toHaveLength(CHUNKS_MAX);
  });
});
