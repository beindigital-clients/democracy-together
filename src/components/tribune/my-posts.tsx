'use client';

import { useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { intlLocale, resolveLocale } from '@/i18n/locale';
import { Link } from '@/i18n/navigation';
import { isMember } from '@/lib/roles';
import { vocabulary } from '@/i18n/vocabulary';

// « Mes billets » (A-11) — îlot client sur /tribune, visible du seul auteur.
// Le fil public ne montre que les billets publiés : un billet retiré par la
// modération disparaissait sans que son auteur en voie le statut. Chaque
// billet porte ici son état — « Publié » ou « Retiré par la modération » — et
// la note rappelle qu'un billet est publié immédiatement, puis modéré a
// posteriori (F-50) : il n'existe pas d'état « en attente ».
export function MyPosts() {
  const t = useTranslations('tribune');
  const tl = useTranslations('library');
  const loc = resolveLocale(useLocale());
  const me = useQuery(api.users.current);
  const posts = useQuery(api.tribune.myPosts);

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
        {t('statusNote')}
      </p>
      {posts.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">{t('myPostsEmpty')}</p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-line">
          {posts.map((p) => {
            const removed = p.status === 'removed';
            return (
              <li
                key={p._id}
                className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  {removed ? (
                    <span className="block break-words text-[14px] text-ink-soft line-through">
                      {p.title}
                    </span>
                  ) : (
                    <Link
                      href={`/tribune/${p._id}`}
                      className="block break-words text-[14px] font-medium text-ink hover:underline"
                    >
                      {p.title}
                    </Link>
                  )}
                  <span className="mt-0.5 block font-mono text-[11px] text-muted">
                    {vocabulary(tl, 'themes.', p.theme)} ·{' '}
                    {vocabulary(t, 'format_', p.format)} ·{' '}
                    {fmtDate(p.createdAt)}
                  </span>
                </div>
                {/* Contrastes ≥ 4,5:1 en clair et en sombre : les jetons
                    `bar-5` (refus) et `accent-text` (accent) sont ceux des
                    erreurs de formulaire et des pastilles de thème. */}
                <span
                  className={`shrink-0 rounded-pill border px-2.5 py-0.5 text-[12px] font-medium ${
                    removed
                      ? 'border-bar-5 text-bar-5'
                      : 'border-accent-edge bg-accent-tint text-accent-text'
                  }`}
                >
                  {vocabulary(t, 'status_', p.status)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
