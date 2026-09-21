// @vitest-environment happy-dom
// PoC d'audit : `vi.restoreAllMocks()` restaure-t-il un espion posé sur
// l'INSTANCE window.localStorage sous happy-dom ?
import { describe, it, expect, afterEach, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('restauration des espions localStorage', () => {
  it('A — pose un espion qui lève', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('refusé', 'SecurityError');
    });
    expect(() => window.localStorage.getItem('x')).toThrow();
  });

  it('B — après afterEach, localStorage doit refonctionner', () => {
    // Si ceci lève, restoreAllMocks n'a PAS restauré : la fuite est prouvée.
    expect(() => window.localStorage.getItem('x')).not.toThrow();
  });
});
