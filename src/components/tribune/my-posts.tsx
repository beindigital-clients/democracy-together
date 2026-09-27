'use client';

import { useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { ContentStatus } from '@convex/lib/communaute';
import { intlLocale, resolveLocale } from '@/i18n/locale';
import { Link } from '@/i18n/navigation';
import { isMember } from '@/lib/roles';
import { vocabulary } from '@/i18n/vocabulary';

// Pastille d'état — jetons de `globals.css` uniquement (contrastes ≥ 4,5:1 en
// clair et en sombre) : `bar-5` (refus), `bar-4` (attente), accent (en ligne).
export const STATUS_PILL: Record<ContentStatus, string> = {
  published: 'border-accent-edge bg-accent-tint text-accent-text',
  pending: 'border-bar-4 text-bar-4',
  rejected: 'border-bar-5 text-bar-5',
  removed: 'border-bar-5 text-bar-5',
};

// « Mes billets » (A-11, F-45) — îlot client sur /tribune, visible du seul
// auteur. Le fil public ne montre que les billets publiés : chaque billet
// porte ici son état — en attente de validation, publié, rejeté (avec le
// motif), retiré — et renvoie, hors ligne, à son aperçu dans l'espace membre.
export function MyPosts() {
  const t = useTranslations('tribune');
  const tl = useTranslations('library');
  const loc = resolveLocale(useLocale());
  const me = useQuery(api.users.current);
  const posts = useQuery(api.tribune.myPosts);
  const policy = useQuery(api.tribune.moderationPolicy);

  if (me === undefined || posts === undefined) return null;
  if (!isMember(me?.role)) return null;

  const fmtDate = (ms: number) =>
    new Intl.DateTimeFormat(intlLocale(loc), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(ms);

  return (
    <section
      aria-labelledby="tr-my-posts"
      className="rounded-md border border-line bg-surface p-5"
    >
      <h2
        id="tr-my-posts"
        className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted"
      >
        {t('myPostsTitle')}
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
        {policy?.postMode === 'a_posteriori'
          ? t('statusNote')
          : t('statusNoteAPriori')}
      </p>
      {posts.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">{t('myPostsEmpty')}</p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-line">
          {posts.map((p) => {
            const online = p.status === 'published';
            return (
              <li
                key={p._id}
                className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={
                      online
                        ? `/tribune/${p._id}`
                        : `/espace-membre/contributions/${p._id}`
                    }
                    className={`block wrap-anywhere text-[14px] hover:underline ${
                      p.status === 'removed'
                        ? 'text-ink-soft line-through'
                        : 'font-medium text-ink'
                    }`}
                  >
                    {p.title}
                  </Link>
                  <span className="mt-0.5 block font-mono text-[11px] text-muted">
                    {vocabulary(tl, 'themes.', p.theme)} ·{' '}
                    {vocabulary(t, 'format_', p.format)} ·{' '}
                    {fmtDate(p.createdAt)}
                  </span>
                  {p.rejectionReason ? (
                    <span className="mt-1 block wrap-anywhere text-[13px] text-ink-soft">
                      {t('reasonLabel', { reason: p.rejectionReason })}
                    </span>
                  ) : null}
                </div>
                <span
                  className={`shrink-0 rounded-pill border px-2.5 py-0.5 text-[12px] font-medium ${STATUS_PILL[p.status]}`}
                >
                  {vocabulary(t, 'status_', p.status)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <Link
        href="/espace-membre/contributions"
        className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-accent-text hover:underline"
      >
        {t('followContributions')}
      </Link>
    </section>
  );
}
