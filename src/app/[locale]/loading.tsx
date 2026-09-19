import { getTranslations } from 'next-intl/server';

// Frontière de chargement (audit § 5.6 : « aucun loading.tsx, donc aucun
// streaming »). Sa présence enveloppe les pages dans un <Suspense>, ce qui
// permet à Next d'envoyer immédiatement l'enveloppe — en-tête et pied de page —
// pendant que le contenu se résout. Sur une liaison lente, l'écran cesse
// d'être blanc le temps de la latence Convex (le backend est aux États-Unis).
//
// Squelette volontairement sobre et sans animation : il doit être moins cher
// que ce qu'il remplace.
export default async function LocaleLoading() {
  const t = await getTranslations('errors');

  return (
    <div
      className="mx-auto w-full max-w-[1180px] px-4 py-24 sm:px-6"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">{t('loading')}</span>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <div className="h-3 w-24 rounded-sm bg-surface-2" />
        <div className="h-10 w-[min(28ch,100%)] rounded-sm bg-surface-2" />
        <div className="h-4 w-[min(52ch,100%)] rounded-sm bg-surface-2" />
        <div className="h-4 w-[min(44ch,100%)] rounded-sm bg-surface-2" />
      </div>
    </div>
  );
}
