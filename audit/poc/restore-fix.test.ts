// @vitest-environment happy-dom
// PoC d'audit : quel geste restaure RÉELLEMENT l'instance localStorage ?
import { describe, it, expect, afterEach, vi } from 'vitest';

const leve = () => {
  throw new DOMException('refusé', 'SecurityError');
};

describe('piste 1 — mockRestore() sur l’espion retourné', () => {
  let spy: ReturnType<typeof vi.spyOn>;
  afterEach(() => spy?.mockRestore());

  it('A — pose', () => {
    spy = vi.spyOn(window.localStorage, 'getItem').mockImplementation(leve);
    expect(() => window.localStorage.getItem('x')).toThrow();
  });
  it('B — restauré ?', () => {
    expect(() => window.localStorage.getItem('x')).not.toThrow();
  });
});

describe('piste 2 — remise en place manuelle de la méthode d’origine', () => {
  const origine = window.localStorage.getItem.bind(window.localStorage);
  afterEach(() => {
    window.localStorage.getItem = origine;
  });

  it('C — pose', () => {
    window.localStorage.getItem = leve;
    expect(() => window.localStorage.getItem('x')).toThrow();
  });
  it('D — restauré ?', () => {
    expect(() => window.localStorage.getItem('x')).not.toThrow();
  });
});
