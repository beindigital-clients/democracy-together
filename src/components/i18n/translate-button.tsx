'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useAction } from 'convex/react';
import { api } from '@convex/_generated/api';
import { useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { translationErrorSuffix } from '@/lib/article-translation';
import { vocabulary } from '@/i18n/vocabulary';

// LE BOUTON QUI DEMANDE UNE TRADUCTION.
//
// Composant client, et c'est le seul de ce dispositif : tout le reste — la
// décision d'affichage, le bandeau, le texte traduit — est rendu côté serveur
// et n'envoie donc rien au navigateur. Ce qui est ici est ce qui ne peut pas
// être ailleurs : un appel déclenché par un clic, son état d'attente, et son
// échec éventuel.
//
// POURQUOI UN CLIC ET PAS UNE TRADUCTION À LA PUBLICATION. Traduire chaque
// contenu dans les quatre autres langues au moment du dépôt, c'est quatre
// appels par contenu, pour des langues que personne ne demandera peut-être.
// À la demande, le premier lecteur paie l'appel et TOUS LES SUIVANTS lisent le
// cache — y compris dans les listes et le back-office. Le coût suit l'usage
// réel, et le cas fréquent (un contenu jamais lu dans une autre langue) est
// gratuit.
//
// `router.refresh()` plutôt qu'un état local : la traduction est rendue par le
// composant SERVEUR de la page, qui la relit depuis Convex. Rafraîchir le
// segment le fait reparcourir avec la traduction désormais en cache, sans
// recharger la page ni perdre la position de lecture.

export function TranslateButton({
  sourceType,
  sourceId,
  targetLocale,
  /** Variante « la traduction existe mais elle est périmée ». */
  retranslate = false,
}: {
  sourceType: 'tribunePost' | 'publication';
  sourceId: string;
  targetLocale: Locale;
  retranslate?: boolean;
}) {
  const t = useTranslations('translation');
  const tl = useTranslations('library');
  const request = useAction(api.translation.requestTranslation);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState(false);
  const [errorSuffix, setErrorSuffix] = useState<string | null>(null);

  const language = vocabulary(tl, 'langs.', targetLocale);
  const busy = running || pending;

  async function run() {
    setErrorSuffix(null);
    setRunning(true);
    try {
      const result = await request({ sourceType, sourceId, targetLocale });
      if (!result.ok) {
        setErrorSuffix(translationErrorSuffix(result.code));
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      // Une exception ici est une panne de transport : l'action elle-même
      // renvoie ses échecs en `{ ok: false }` plutôt que de lever.
      setErrorSuffix('Generic');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        aria-busy={busy}
        className="inline-flex items-center gap-1.5 rounded-sm border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-medium text-ink-soft transition-colors hover:text-ink disabled:opacity-60"
      >
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="M4 5h10M9 3v2c0 4-2 7-5 8M7 10c0 3 3 5 7 6M14 19l4-9 4 9M16.5 16h5" />
        </svg>
        {busy
          ? t('translating')
          : retranslate
            ? t('retranslate')
            : t('offer', { language })}
      </button>
      {errorSuffix ? (
        // `role="status"` et non `alert` : l'échec d'une traduction proposée
        // n'interrompt pas la lecture de l'article, qui reste entier au-dessus.
        <p role="status" className="text-[13px] text-muted">
          {vocabulary(t, 'err', errorSuffix, t('errGeneric'))}{' '}
          <button
            type="button"
            onClick={() => void run()}
            className="underline underline-offset-2 hover:text-ink"
          >
            {t('retry')}
          </button>
        </p>
      ) : null}
    </div>
  );
}
