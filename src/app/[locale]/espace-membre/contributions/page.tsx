'use client';

import { AuthGate, AuthGateLoading } from '@/components/auth/auth-gate';
import { useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { isMember } from '@/lib/roles';
import { intlLocale } from '@/i18n/locale';
import { vocabulary } from '@/i18n/vocabulary';
import { STATUS_PILL } from '@/components/tribune/my-posts';

// MES CONTRIBUTIONS À LA TRIBUNE (F-45) — l'auteur voit l'ÉTAT de chacune :
// en attente de validation, publiée, rejetée (avec le motif), retirée. Un
// billet hors ligne s'ouvre ici en aperçu (et se corrige s'il est en attente
// ou rejeté) ; les invitations à approfondir un billet (F-48) y figurent aussi.
function Contributions() {
  const t = useTranslations('tribune');
  const tl = useTranslations('library');
  const locale = intlLocale(useLocale());
  const me = useQuery(api.users.current);
  const posts = useQuery(api.tribune.myPosts);
  const comments = useQuery(api.tribune.myComments);
  const invites = useQuery(api.tribune.myDeepeningInvites);

  if (me === undefined) return <AuthGateLoading className="max-w-3xl" />;

  const fmtDate = (ms: number) =>
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(ms);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="text-[13px] text-muted">
        <Link href="/espace-membre" className="text-muted hover:text-ink">
          {t('memberSpace')}
        </Link>{' '}
        / {t('contributionsTitle')}
      </p>
      <h1 className="mt-4 font-display text-[clamp(28px,3.4vw,40px)] font-medium leading-tight">
        {t('contributionsTitle')}
      </h1>
      <p className="mt-3 max-w-[60ch] text-ink-soft">
        {t('contributionsLead')}
      </p>

      {!isMember(me?.role) ? (
        <p className="mt-8 text-ink-soft">{t('membersOnly')}</p>
      ) : (
        <>
          {invites && invites.length > 0 ? (
            <section
              aria-labelledby="c-invites"
              className="mt-8 rounded-md border border-accent-edge bg-accent-tint p-5"
            >
              <h2 id="c-invites" className="font-display text-lg text-ink">
                {t('deepenInvitesTitle')}
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                {invites.map((i) => (
                  <li key={i._id} className="text-sm text-ink">
                    <Link
                      href={`/tribune/${i.postId}`}
                      className="wrap-anywhere font-semibold text-accent-text hover:underline"
                    >
                      {i.postTitle}
                    </Link>{' '}
                    <span className="text-ink-soft">
                      {t('byAuthor', { name: i.authorName })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="c-posts" className="mt-8">
            <h2 id="c-posts" className="font-display text-2xl">
              {t('myPostsTitle')}
            </h2>
            {posts === undefined ? (
              <p className="mt-4 text-ink-soft">{t('loading')}</p>
            ) : posts.length === 0 ? (
              <p className="mt-4 text-ink-soft">{t('myPostsEmpty')}</p>
            ) : (
              <ul className="mt-4 flex flex-col divide-y divide-line rounded-md border border-line bg-surface">
                {posts.map((p) => (
                  <li
                    key={p._id}
                    className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={
                          p.status === 'published'
                            ? `/tribune/${p._id}`
                            : `/espace-membre/contributions/${p._id}`
                        }
                        className="wrap-anywhere font-medium text-ink hover:underline"
                      >
                        {p.title}
                      </Link>
                      <span className="mt-0.5 block font-mono text-[11px] text-muted">
                        {vocabulary(tl, 'themes.', p.theme)} ·{' '}
                        {vocabulary(t, 'format_', p.format)} ·{' '}
                        {fmtDate(p.createdAt)}
                        {p.parentPostId ? ` · ${t('deepeningBadge')}` : ''}
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
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="c-comments" className="mt-10">
            <h2 id="c-comments" className="font-display text-2xl">
              {t('myCommentsTitle')}
            </h2>
            {comments === undefined ? (
              <p className="mt-4 text-ink-soft">{t('loading')}</p>
            ) : comments.length === 0 ? (
              <p className="mt-4 text-ink-soft">{t('myCommentsEmpty')}</p>
            ) : (
              <ul className="mt-4 flex flex-col divide-y divide-line rounded-md border border-line bg-surface">
                {comments.map((c) => (
                  <li
                    key={c._id}
                    className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="wrap-anywhere text-sm text-ink">
                        {c.excerpt}
                      </p>
                      <span className="mt-0.5 block font-mono text-[11px] text-muted">
                        {t('onPost', { title: c.postTitle })} ·{' '}
                        {fmtDate(c.createdAt)}
                      </span>
                      {c.rejectionReason ? (
                        <span className="mt-1 block wrap-anywhere text-[13px] text-ink-soft">
                          {t('reasonLabel', { reason: c.rejectionReason })}
                        </span>
                      ) : null}
                    </div>
                    <span
                      className={`shrink-0 rounded-pill border px-2.5 py-0.5 text-[12px] font-medium ${STATUS_PILL[c.status]}`}
                    >
                      {vocabulary(t, 'status_', c.status)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default function ContributionsPage() {
  return (
    <AuthGate className="max-w-3xl">
      <Contributions />
    </AuthGate>
  );
}
