'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useAction } from 'convex/react';
import { api } from '@convex/_generated/api';
import { useRouter } from '@/i18n/navigation';
import { routing, type Locale } from '@/i18n/routing';
import { LOCALE_ENDONYMS, direction } from '@/i18n/direction';
import { translationErrorSuffix } from '@/lib/article-translation';
import { vocabulary } from '@/i18n/vocabulary';

// CHOISIR LA LANGUE DU DOCUMENT.
//
// Le lecteur voit les cinq langues. Celles qui sont PRÊTES mènent directement à
// la version correspondante ; les autres portent un bouton qui la prépare, puis
// y mène. La distinction est visible avant le clic — sans quoi tous les boutons
// se ressembleraient et l'un d'eux prendrait trente secondes sans prévenir.
//
// LA LANGUE PAR DÉFAUT EST CELLE DE L'APPLICATION. La page ouvre sur
// `?lang=<locale de la page>` ; ce composant ne sert qu'à en sortir. C'est ce
// que demande le cas d'usage : un lecteur arabophone qui télécharge un rapport
// veut sa version arabe, pas un choix à faire.
//
// LES LIBELLÉS SONT DES ENDONYMES, comme dans le sélecteur de langue du site
// (src/i18n/direction.ts) : « Português », pas « Portugais ».

export function DocumentLanguagePicker({
  slug,
  current,
  /** Langues déjà prêtes — les autres demandent une préparation. */
  ready,
}: {
  slug: string;
  current: Locale;
  ready: readonly Locale[];
}) {
  const t = useTranslations('translation');
  const router = useRouter();
  const [preparing, setPreparing] = useState<Locale | null>(null);
  const [errorSuffix, setErrorSuffix] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const prepare = useAction(api.documents.prepareDocument);

  function goTo(target: Locale) {
    startTransition(() => {
      router.replace(`/bibliotheque/${slug}/document?lang=${target}`);
      router.refresh();
    });
  }

  async function run(target: Locale) {
    setErrorSuffix(null);
    setPreparing(target);
    try {
      const result = await prepare({ slug, targetLocale: target });
      if (!result.ok) {
        setErrorSuffix(translationErrorSuffix(result.code));
        return;
      }
      goTo(target);
    } catch {
      setErrorSuffix('Generic');
    } finally {
      setPreparing(null);
    }
  }

  return (
    <div className="print:hidden">
      <h2 className="font-display text-lg text-ink">{t('docTitle')}</h2>
      <p className="mt-1 max-w-[62ch] text-[13.5px] text-muted">
        {t('docLead')}
      </p>

      <ul className="mt-3 flex flex-wrap gap-2">
        {routing.locales.map((l) => {
          const isCurrent = l === current;
          const isReady = ready.includes(l);
          const busy = preparing === l || (pending && preparing === l);
          const label = LOCALE_ENDONYMS[l];
          // LA LANGUE COURANTE N'EST INERTE QUE SI ELLE EST PRÊTE.
          //
          // Elle était rendue en `<span>` dans tous les cas, et c'était une
          // impasse : la page ouvre par défaut sur la langue de l'application
          // (c'est la demande), donc le premier visiteur d'un document jamais
          // préparé arrivait sur SA langue, lisait « aucun contenu » et n'avait
          // aucun bouton pour le préparer. Le seul chemin était de préparer une
          // AUTRE langue — un appel complet payé pour rien — puis de revenir.
          const inerte = isCurrent && isReady;
          return (
            <li key={l}>
              {inerte ? (
                <span
                  aria-current="true"
                  lang={l}
                  dir={direction(l)}
                  className="inline-flex items-center rounded-sm border border-accent-edge bg-accent-tint px-3 py-1.5 text-[13px] font-medium text-accent-text"
                >
                  {label}
                </span>
              ) : (
                <button
                  type="button"
                  lang={l}
                  dir={direction(l)}
                  disabled={busy}
                  aria-busy={busy}
                  aria-current={isCurrent ? 'true' : undefined}
                  onClick={() => (isReady ? goTo(l) : void run(l))}
                  className={`inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-[13px] transition-colors disabled:opacity-60 ${
                    isCurrent
                      ? 'border-accent-edge bg-accent-tint font-medium text-accent-text'
                      : 'border-line-strong bg-surface text-ink-soft hover:text-ink'
                  }`}
                >
                  {label}
                  {isReady ? (
                    // Une pastille, pas un mot : la liste reste lisible d'un
                    // coup d'œil, et l'information passe aussi à l'assistance
                    // technique par le `title` du SVG voisin.
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 rounded-full bg-accent"
                    />
                  ) : null}
                  <span className="sr-only">
                    {isReady
                      ? t('docReady', { language: label })
                      : t('docPrepare', { language: label })}
                  </span>
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {preparing ? (
        <p role="status" className="mt-2 text-[13px] text-muted">
          {t('docPreparing')}
        </p>
      ) : null}
      {errorSuffix ? (
        <p role="status" className="mt-2 text-[13px] text-muted">
          {vocabulary(t, 'err', errorSuffix, t('errGeneric'))}
        </p>
      ) : null}
    </div>
  );
}
