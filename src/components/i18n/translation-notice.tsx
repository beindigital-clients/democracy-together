import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { vocabulary } from '@/i18n/vocabulary';
import {
  translationErrorSuffix,
  type ArticleDisplay,
} from '@/lib/article-translation';
import { TranslateButton } from './translate-button';

// LE BANDEAU QUI DIT AU LECTEUR CE QU'IL LIT.
//
// Composant SERVEUR : il ne contient aucune interaction, seulement du texte et
// un lien. Le seul morceau client est `TranslateButton`, monté à l'intérieur —
// c'est pour cela que le catalogue `translation` traverse la frontière RSC,
// et pour cela seulement.
//
// TROIS ÉTATS, TROIS BANDEAUX DIFFÉRENTS, et aucun quand la langue du contenu
// est celle du lecteur. Un bandeau qui dirait « cet article est en français »
// sur un article français à un lecteur français est exactement le genre de
// bruit qui fait qu'on cesse de lire les bandeaux — y compris celui qui
// compte.
//
// LE LIEN VERS L'ORIGINAL PASSE PAR L'URL (`?original=1`) et pas par un état
// local. Trois raisons : la page reste rendue côté serveur, l'adresse de
// l'original est partageable, et un lecteur sans JavaScript y accède comme les
// autres — ce qui est l'hypothèse de travail du projet (F-05, faible débit).

function Frame({
  tone,
  children,
}: {
  tone: 'info' | 'warn';
  children: React.ReactNode;
}) {
  return (
    <aside
      className={`mt-6 rounded-sm border px-4 py-3 text-[13px] ${
        tone === 'warn'
          ? 'border-line-strong bg-surface-2 text-ink-soft'
          : 'border-accent-edge bg-accent-tint text-ink-soft'
      }`}
    >
      {children}
    </aside>
  );
}

export async function TranslationNotice({
  display,
  readerLocale,
  sourceType,
  sourceId,
  /** Chemin de la page, pour construire le lien « lire l'original ». */
  pathname,
  /** Query string courante, préservée par le lien (filtres, ancres). */
  search = '',
}: {
  display: ArticleDisplay;
  readerLocale: Locale;
  sourceType: 'tribunePost' | 'publication';
  sourceId: string;
  pathname: string;
  search?: string;
}) {
  if (display.kind === 'native') return null;

  const t = await getTranslations('translation');
  const tl = await getTranslations('library');

  const sourceName = vocabulary(tl, 'langs.', display.sourceLocale);
  const readerName = vocabulary(tl, 'langs.', readerLocale);

  const params = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search,
  );
  params.delete('original');
  const withoutOriginal = params.toString();
  const originalHref = `${pathname}?${new URLSearchParams({
    ...Object.fromEntries(params),
    original: '1',
  }).toString()}`;
  const translatedHref = withoutOriginal
    ? `${pathname}?${withoutOriginal}`
    : pathname;

  if (display.kind === 'translated') {
    return (
      <Frame tone="info">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="rounded-pill border border-accent-edge px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.06em] text-accent-text">
            {t('badge')}
          </span>
          <span>{t('translatedFrom', { language: sourceName })}</span>
        </p>
        <p className="mt-1.5 text-muted">{t('notReviewed')}</p>
        <p className="mt-2">
          <Link
            href={originalHref}
            // L'intitulé du lien porte la langue de l'original, donc il est
            // rédigé dans la langue du lecteur : pas de `lang` ici. C'est le
            // NOM de la langue qui est traduit, pas le lien.
            className="font-medium text-accent-text underline underline-offset-2"
          >
            {t('readOriginal', { language: sourceName })}
          </Link>
        </p>
      </Frame>
    );
  }

  // display.kind === 'original'
  return (
    <Frame tone="warn">
      <p>
        {display.stale
          ? t('stale')
          : t('originalNotice', { language: sourceName })}
      </p>
      {display.errorCode ? (
        <p className="mt-1.5 text-muted">
          {t('failed')}{' '}
          {vocabulary(
            t,
            'err',
            translationErrorSuffix(display.errorCode),
            t('errGeneric'),
          )}
        </p>
      ) : null}
      <div className="mt-2.5">
        {display.translationAvailable ? (
          <Link
            href={translatedHref}
            className="font-medium text-accent-text underline underline-offset-2"
          >
            {t('readTranslation', { language: readerName })}
          </Link>
        ) : (
          <TranslateButton
            sourceType={sourceType}
            sourceId={sourceId}
            targetLocale={readerLocale}
            retranslate={display.stale}
          />
        )}
      </div>
    </Frame>
  );
}

// `textAttrs` vit désormais dans `@/i18n/content-lang` : les LISTES en ont
// besoin aussi, y compris côté client (RGAA 8.7). Ré-exporté ici pour les
// fiches qui l'importaient de ce module.
export { textAttrs } from '@/i18n/content-lang';
