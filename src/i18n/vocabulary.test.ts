import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTranslator } from 'next-intl';
import { vocabulary, humanizeTerm } from '@/i18n/vocabulary';

// Le VOCABULAIRE est la seule famille de clés qui mérite un repli (issue #33) :
// un slug de thème ou de région venu de la base peut sortir du dictionnaire —
// `THEMES` vit dans quatre fichiers (issue #30) — et ne doit pas emporter la
// page. Tout le reste est un libellé écrit en dur, donc un bug quand il manque.
//
// Le traducteur employé ici est le VRAI (`createTranslator` de next-intl), pas
// une doublure : ce qu'on vérifie tient entièrement à `t.has()`, qui répond
// sans lever ni journaliser. Une doublure maison prouverait seulement que la
// doublure se comporte comme on l'a écrite.

const messages = {
  library: {
    themes: { participation: 'Participation citoyenne' },
    empty: 'Aucune publication',
  },
  admin: { revStage_in_review: 'En revue' },
};

function t(namespace: 'library' | 'admin') {
  return createTranslator({ locale: 'fr', messages, namespace });
}

afterEach(() => vi.restoreAllMocks());

describe('vocabulary — repli explicite pour le vocabulaire dynamique', () => {
  it('rend le libellé traduit quand le terme est au dictionnaire', () => {
    expect(vocabulary(t('library'), 'themes.', 'participation')).toBe(
      'Participation citoyenne',
    );
  });

  it('rend un repli lisible quand le terme en sort', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(vocabulary(t('library'), 'themes.', 'gouvernance-numerique')).toBe(
      'Gouvernance numerique',
    );
  });

  it('accepte un repli explicite', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(vocabulary(t('library'), 'themes.', 'inconnu', 'Autre')).toBe(
      'Autre',
    );
  });

  it('gère un séparateur autre que le point', () => {
    // `revStage_in_review` : le terme porte lui-même un souligné, d'où le
    // préfixe passé en entier plutôt qu'un découpage a posteriori.
    expect(vocabulary(t('admin'), 'revStage_', 'in_review')).toBe('En revue');
  });

  it('n’escalade RIEN : ni erreur levée, ni onError, ni getMessageFallback', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() =>
      vocabulary(t('library'), 'themes.', 'slug-jamais-vu'),
    ).not.toThrow();

    // C'est LA propriété qui permet de rendre `getMessageFallback` strict :
    // une clé de vocabulaire absente ne passe jamais par le chemin d'erreur.
    expect(error).not.toHaveBeenCalled();
    // En développement elle laisse tout de même une trace — un vocabulaire qui
    // a divergé se voit, sans être traité comme un bug d'interface.
    expect(warn).toHaveBeenCalledOnce();
  });

  it('ne se déclenche pas sur une clé présente', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vocabulary(t('library'), 'themes.', 'participation');
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('humanizeTerm — le repli par défaut', () => {
  it('remplace les séparateurs et capitalise', () => {
    expect(humanizeTerm('gouvernance-numerique')).toBe('Gouvernance numerique');
    expect(humanizeTerm('in_review')).toBe('In review');
    expect(humanizeTerm('europe')).toBe('Europe');
  });

  it('laisse passer un terme vide sans inventer de libellé', () => {
    expect(humanizeTerm('')).toBe('');
  });
});
