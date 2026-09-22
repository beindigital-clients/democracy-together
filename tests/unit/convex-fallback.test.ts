import { describe, it, expect, vi } from 'vitest';
import { notFound, redirect } from 'next/navigation';
import {
  fetchOrFallback,
  EMPTY_PUBLICATION_LIST,
  EMPTY_DIRECTORY_LIST,
  EMPTY_EXPERT_LIST,
  EMPTY_TRIBUNE_POSTS,
} from '@/lib/convex-fallback';

// F-02 — une source indisponible ne doit pas emporter la page.
//
// Ce qui compte ici n'est pas « la valeur est bien relue » : c'est qu'AUCUN
// mode de défaillance ne remonte jusqu'au rendu. Cinq pages publiques
// (bibliothèque, experts, réseau, thématiques, tribune) répondaient 500 quand
// Convex était injoignable ; ce module est la garde, donc ses chemins de
// sortie sont exercés un par un.
//
// `vi.restoreAllMocks()` n'est PAS employé : il ne restaure pas un espion posé
// sur une instance (constaté sur `window.localStorage` sous happy-dom, audit
// F-01). Chaque espion est rendu explicitement par son propre `mockRestore()`.

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

  // C'est la raison d'être de l'argument FONCTION. Une promesse passée telle
  // quelle serait déjà créée au moment d'entrer dans le `try` ; un jet
  // synchrone au montage de la requête échapperait alors à la capture et la
  // page reprendrait un 500 — exactement le défaut qu'on referme.
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
    // Identité, pas égalité structurelle : la page doit recevoir CET objet,
    // pas une copie — sans quoi un repli partagé pourrait diverger.
    expect(out).toBe(repli);
    spy.mockRestore();
  });
});

// Le mode de défaillance le plus coûteux de ce module, et le moins visible.
//
// Next signale par un JET ce qui n'est pas une panne : `notFound()`,
// `redirect()`, et la sortie du rendu statique (« Dynamic server usage »), que
// `fetchQuery` déclenche à CHAQUE génération. Un `catch` qui les avale ne
// produit pas une erreur : il produit une route que Next croit statique, dont
// le REPLI est figé dans le HTML pré-rendu. La page afficherait « contenu
// indisponible » en permanence, backend en parfait état — et aucun test
// fonctionnel ne le verrait, puisque la page répond 200.
describe('Signaux internes de Next — ils doivent TRAVERSER le repli', () => {
  it('laisse passer notFound()', async () => {
    const spy = silenceConsole();
    await expect(
      fetchOrFallback('detail', async () => notFound(), 'repli'),
    ).rejects.toThrow();
    // Et ne le journalise pas comme une panne : ce n'en est pas une.
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
  // Le typage (`FunctionReturnType`) garantit déjà que les clés existent. Ce
  // que ces tests tiennent, c'est qu'elles sont VIDES : un repli peuplé à la
  // main afficherait des données inventées, ce qui serait pire qu'un 500.
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
