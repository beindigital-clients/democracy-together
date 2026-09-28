// @vitest-environment happy-dom
// Audit PoC: does `vi.restoreAllMocks()` restore a spy set on
// the window.localStorage INSTANCE under happy-dom?
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
    // If this throws, restoreAllMocks did NOT restore: the leak is proven.
    expect(() => window.localStorage.getItem('x')).not.toThrow();
  });
});
