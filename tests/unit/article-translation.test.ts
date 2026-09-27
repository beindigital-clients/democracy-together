import { describe, it, expect } from 'vitest';
import {
  resolveArticleDisplay,
  translationErrorSuffix,
  type CachedTranslation,
} from '@/lib/article-translation';

// La décision « que montre-t-on au lecteur ? » a cinq issues et une règle qui
// les gouverne : l'original ne disparaît jamais. Ce fichier tient cette règle
// sur chacune des cinq, y compris les deux qui ne se voient pas en naviguant
// (traduction périmée, traduction en échec) — ce sont précisément celles qu'un
// test manuel ne produit pas.

const FIELDS = {
  title: 'Título traducido',
  body: ['Primer párrafo.', 'Segundo párrafo.'],
};

function cached(over: Partial<NonNullable<CachedTranslation>> = {}) {
  return {
    status: 'ready' as const,
    sourceLocale: 'fr' as const,
    targetLocale: 'es' as const,
    fields: FIELDS,
    fresh: true,
    ...over,
  };
}

describe('Affichage d’un article — la langue du lecteur est celle du texte', () => {
  it('ne signale rien, même si une traduction traîne en cache', () => {
    // Le bandeau n'a de sens que pour dire au lecteur qu'il lit autre chose que
    // l'original. Sur un article français lu en français, c'est du bruit.
    expect(resolveArticleDisplay('fr', 'fr', null, false)).toEqual({
      kind: 'native',
    });
    expect(resolveArticleDisplay('fr', 'fr', cached(), false)).toEqual({
      kind: 'native',
    });
  });
});

describe('Affichage d’un article — aucune traduction en cache', () => {
  it('sert l’original et n’en propose pas une qui n’existe pas', () => {
    const d = resolveArticleDisplay('fr', 'es', null, false);
    expect(d).toEqual({
      kind: 'original',
      sourceLocale: 'fr',
      translationAvailable: false,
      stale: false,
      errorCode: undefined,
    });
  });
});

describe('Affichage d’un article — traduction disponible', () => {
  it('sert la traduction, et porte la langue source pour le bandeau', () => {
    const d = resolveArticleDisplay('fr', 'es', cached(), false);
    expect(d).toEqual({
      kind: 'translated',
      sourceLocale: 'fr',
      fields: FIELDS,
    });
  });

  it('le lecteur qui demande l’original l’obtient, traduction ou pas', () => {
    // C'est tout l'objet du lien « lire l'original » : il doit gagner contre la
    // disponibilité d'une traduction, sans quoi il ne mène nulle part.
    const d = resolveArticleDisplay('fr', 'es', cached(), true);
    expect(d).toMatchObject({ kind: 'original', translationAvailable: true });
  });

  it('depuis l’original, le retour vers la traduction reste proposé', () => {
    const d = resolveArticleDisplay('fr', 'es', cached(), true);
    expect(d).toMatchObject({ translationAvailable: true, stale: false });
  });
});

describe('Affichage d’un article — traduction inutilisable', () => {
  it('périmée : l’original prime et la mise à jour est proposée', () => {
    // `fresh: false` veut dire que l'auteur a modifié son texte depuis. Servir
    // la traduction reviendrait à afficher une version qui n'existe plus, sans
    // que rien ne le dise.
    const d = resolveArticleDisplay(
      'fr',
      'es',
      cached({ fresh: false }),
      false,
    );
    expect(d).toEqual({
      kind: 'original',
      sourceLocale: 'fr',
      translationAvailable: false,
      stale: true,
      errorCode: undefined,
    });
  });

  it('en échec : l’original, et la raison', () => {
    const d = resolveArticleDisplay(
      'fr',
      'es',
      cached({ status: 'failed', fields: undefined, error: 'RATE_LIMITED' }),
      false,
    );
    expect(d).toEqual({
      kind: 'original',
      sourceLocale: 'fr',
      translationAvailable: false,
      stale: false,
      errorCode: 'RATE_LIMITED',
    });
  });

  it('en attente : traitée comme absente, jamais comme prête', () => {
    const d = resolveArticleDisplay(
      'fr',
      'es',
      cached({ status: 'pending', fields: undefined }),
      false,
    );
    expect(d).toMatchObject({ kind: 'original', translationAvailable: false });
  });

  it('« prête » sans contenu ne s’affiche pas comme traduite', () => {
    // Cas dégénéré qu'aucune écriture ne produit aujourd'hui, mais que le type
    // autorise : `fields` est optionnel. Servir `kind: 'translated'` ici
    // rendrait un article vide sous un bandeau affirmant qu'il est traduit.
    const d = resolveArticleDisplay(
      'fr',
      'es',
      cached({ fields: undefined }),
      false,
    );
    expect(d).toMatchObject({ kind: 'original' });
  });

  it('un échec n’est pas rappelé à qui a demandé l’original', () => {
    const d = resolveArticleDisplay(
      'fr',
      'es',
      cached({ status: 'failed', fields: undefined, error: 'RATE_LIMITED' }),
      true,
    );
    expect(d).toMatchObject({ kind: 'original', errorCode: undefined });
  });
});

describe('Codes d’échec — un libellé pour chacun, un repli pour le reste', () => {
  it('traduit les codes connus', () => {
    expect(translationErrorSuffix('RATE_LIMITED')).toBe('RateLimited');
    expect(translationErrorSuffix('AI_GATEWAY_NOT_CONFIGURED')).toBe(
      'NotConfigured',
    );
    expect(translationErrorSuffix('TOO_LONG')).toBe('TooLong');
    expect(translationErrorSuffix('FORBIDDEN')).toBe('Forbidden');
  });

  it('retombe sur le message générique pour un code inattendu', () => {
    // La passerelle peut inventer un code demain : la page doit dire « service
    // indisponible », pas afficher un identifiant technique ni lever.
    expect(translationErrorSuffix('QUELQUE_CHOSE_DE_NOUVEAU')).toBe('Generic');
    expect(translationErrorSuffix(undefined)).toBe('Generic');
    expect(translationErrorSuffix('')).toBe('Generic');
  });
});
