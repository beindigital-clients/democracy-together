import { getTranslations } from 'next-intl/server';

// What a page renders when its DATA could not be loaded (F-02).
//
// Not to be confused with a page's empty state: "no results" is a
// true piece of information, "unavailable" is another. Displaying them the same
// would make the visitor believe the network has no members, or that their
// search finds nothing — when it is the backend that is silent.
//
// The block is rendered by the SERVER, inside the layout: the
// visitor keeps the header, navigation and footer, and sees this
// text even without JavaScript. That is what sets it apart from `error.tsx`, whose
// limit has been measured: the error boundary currently renders zero characters
// in the served HTML.
export async function DataUnavailable({ className }: { className?: string }) {
  const t = await getTranslations('errors');
  return (
    <div
      role="status"
      className={`rounded-sm border border-dashed border-line-strong bg-surface px-6 py-14 text-center ${className ?? ''}`}
    >
      <p className="font-display text-lg text-ink">{t('unavailableTitle')}</p>
      <p className="mx-auto mt-2 max-w-[52ch] text-[15px] leading-relaxed text-ink-soft">
        {t('unavailableBody')}
      </p>
    </div>
  );
}
