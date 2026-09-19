'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

// Frontière d'erreur localisée (audit § 5.1). Sans elle, une panne Convex ou
// Sanity produisait un 500 générique, hors charte et en anglais.
//
// NB Next 16 : la prop de reprise s'appelle `retry` (et non `reset` comme dans
// les versions antérieures) — cf. node_modules/next/dist/docs/01-app/
// 03-api-reference/03-file-conventions/error.md. Une frontière d'erreur DOIT
// être un composant client.
export default function LocaleError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useTranslations('errors');

  useEffect(() => {
    // Pas de service de télémétrie dans le projet : on journalise côté serveur
    // via la console, ce que Vercel capture déjà dans les logs d'exécution.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-24 sm:px-6">
      <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-muted">
        500
      </p>
      <h1 className="mt-3 max-w-[18ch] font-display text-[clamp(28px,4vw,42px)] font-medium leading-[1.1] tracking-[-0.015em]">
        {t('errorTitle')}
      </h1>
      <p className="mt-4 max-w-[60ch] text-[15px] leading-relaxed text-ink-soft">
        {t('errorBody')}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex items-center justify-center rounded-sm bg-accent px-4 py-3 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-strong"
        >
          {t('errorRetry')}
        </button>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-sm border border-line-strong px-4 py-3 text-sm font-semibold text-ink transition-colors hover:border-ink hover:bg-accent-tint"
        >
          {t('errorHome')}
        </Link>
      </div>
      {/* `digest` est l'identifiant que Next attribue à l'erreur côté serveur :
          c'est ce qui permet de la retrouver dans les logs. */}
      {error.digest ? (
        <p className="mt-6 font-mono text-[12px] text-muted">
          {t('errorReference')} : {error.digest}
        </p>
      ) : null}
    </div>
  );
}
