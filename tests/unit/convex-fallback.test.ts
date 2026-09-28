import { describe, it, expect, vi } from 'vitest';
import { notFound, redirect } from 'next/navigation';
import {
  fetchOrFallback,
  EMPTY_PUBLICATION_LIST,
  EMPTY_DIRECTORY_LIST,
  EMPTY_EXPERT_LIST,
  EMPTY_TRIBUNE_POSTS,
} from '@/lib/convex-fallback';

// F-02 — an unavailable source must not take the page down with it.
//
// What matters here is not "the value is read back correctly": it is that NO
// failure mode propagates up to the render. Five public pages
// (library, experts, network, themes, tribune) responded 500 when
// Convex was unreachable; this module is the guard, so its exit
// paths are exercised one by one.
//
// `vi.restoreAllMocks()` is NOT used: it does not restore a spy set
// on an instance (observed on `window.localStorage` under happy-dom, audit
// F-01). Each spy is restored explicitly by its own `mockRestore()`.

function silenceConsole() {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  return spy;
}

describe('fetchOrFallback — le chemin nominal', () => {
  it('rend la valeur de la requête quand elle aboutit', async () => {
    const out = await fetchOrFallback('test', async () => ({ ok: 1 }), {
      ok: 0,
    });
    expect(out).toEqual({ ok: 1 });
  });

  it('ne journalise rien quand tout va bien', async () => {
    const spy = silenceConsole();
    await fetchOrFallback('test', async () => 'valeur', 'repli');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('fetchOrFallback — les défaillances', () => {
  it('rend le repli quand la requête est rejetée', async () => {
    const spy = silenceConsole();
    const out = await fetchOrFallback(
      'bibliotheque',
      () => Promise.reject(new Error('backend injoignable')),
      EMPTY_PUBLICATION_LIST,
    );
    expect(out).toBe(EMPTY_PUBLICATION_LIST);
    spy.mockRestore();
  });

  // This is the reason for the FUNCTION argument. A promise passed as is
  // would already be created by the time the `try` is entered; a
  // synchronous throw while building the request would then escape the catch and the
  // page would go back to a 500 — exactly the defect we are closing.
  it('capture aussi un jet SYNCHRONE au montage de la requête', async () => {
    const spy = silenceConsole();
    const out = await fetchOrFallback(
      'tribune',
      () => {
        throw new Error('jet synchrone');
      },
      EMPTY_TRIBUNE_POSTS,
    );
    expect(out).toBe(EMPTY_TRIBUNE_POSTS);
    spy.mockRestore();
  });

  it('journalise la source ET l’erreur — le repli ne masque pas la panne', async () => {
    const spy = silenceConsole();
    const boum = new Error('Host not in allowlist');
    await fetchOrFallback('le-reseau', () => Promise.reject(boum), null);
    expect(spy).toHaveBeenCalledTimes(1);
    const [message, erreur] = spy.mock.calls[0];
    expect(message).toContain('le-reseau');
    expect(erreur).toBe(boum);
    spy.mockRestore();
  });

  it('ne rattrape pas ce qui n’est pas une défaillance de requête : le repli est rendu tel quel', async () => {
    const spy = silenceConsole();
    const repli = { items: [], total: 0 };
    const out = await fetchOrFallback(
      'experts',
      () => Promise.reject(new Error('x')),
      repli,
    );
    // Identity, not structural equality: the page must receive THIS object,
    // not a copy — otherwise a shared fallback could diverge.
    expect(out).toBe(repli);
    spy.mockRestore();
  });
});

// The most costly failure mode of this module, and the least visible.
//
// Next signals by a THROW things that are not outages: `notFound()`,
// `redirect()`, and the bail-out from static rendering ("Dynamic server usage"), which
// `fetchQuery` triggers on EVERY generation. A `catch` that swallows them does not
// produce an error: it produces a route that Next believes is static, whose
// FALLBACK is frozen into the prerendered HTML. The page would show "contenu
// indisponible" permanently, with the backend in perfect shape — and no functional
// test would see it, since the page responds 200.
describe('Signaux internes de Next — ils doivent TRAVERSER le repli', () => {
  it('laisse passer notFound()', async () => {
    const spy = silenceConsole();
    await expect(
      fetchOrFallback('detail', async () => notFound(), 'repli'),
    ).rejects.toThrow();
    // And does not log it as an outage: it is not one.
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('laisse passer redirect()', async () => {
    const spy = silenceConsole();
    await expect(
      fetchOrFallback('detail', async () => redirect('/fr'), 'repli'),
    ).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('mais capture bien une erreur ordinaire', async () => {
    const spy = silenceConsole();
    const out = await fetchOrFallback(
      'detail',
      async () => {
        throw new Error('panne réseau');
      },
      'repli',
    );
    expect(out).toBe('repli');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('Formes vides — ce que la page rend quand le backend est muet', () => {
  // The typing (`FunctionReturnType`) already guarantees the keys exist. What
  // these tests hold is that they are EMPTY: a fallback populated by
  // hand would display made-up data, which would be worse than a 500.
  it('publications : items, total et les cinq facettes à zéro', () => {
    expect(EMPTY_PUBLICATION_LIST.items).toEqual([]);
    expect(EMPTY_PUBLICATION_LIST.total).toBe(0);
    expect(Object.keys(EMPTY_PUBLICATION_LIST.facets).sort()).toEqual([
      'access',
      'languages',
      'regions',
      'themes',
      'types',
    ]);
    for (const f of Object.values(EMPTY_PUBLICATION_LIST.facets)) {
      expect(f).toEqual([]);
    }
  });

  it('annuaire : items, total et les quatre facettes à zéro', () => {
    expect(EMPTY_DIRECTORY_LIST.items).toEqual([]);
    expect(EMPTY_DIRECTORY_LIST.total).toBe(0);
    expect(Object.keys(EMPTY_DIRECTORY_LIST.facets).sort()).toEqual([
      'countries',
      'languages',
      'regions',
      'themes',
    ]);
    for (const f of Object.values(EMPTY_DIRECTORY_LIST.facets)) {
      expect(f).toEqual([]);
    }
  });

  it('experts et tribune : des listes vides', () => {
    expect(EMPTY_EXPERT_LIST).toEqual([]);
    expect(EMPTY_TRIBUNE_POSTS).toEqual([]);
  });
});
