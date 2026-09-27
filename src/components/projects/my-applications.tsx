'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { callWindowState } from '@convex/lib/programmes';
import { Link } from '@/i18n/navigation';
import { vocabulary } from '@/i18n/vocabulary';
import {
  CARD,
  StatusPill,
  statusTone,
  useDateFormat,
} from '@/components/programmes/shared';

// « Mes candidatures » aux appels (F-60) et appels ouverts à cet instant.
export function MyCallApplications() {
  const t = useTranslations('projects');
  const fmt = useDateFormat();
  const mine = useQuery(api.projectCalls.myCallApplications);
  const calls = useQuery(api.projectCalls.listPublicCalls);
  const [now] = useState(() => Date.now());
  if (mine === undefined || calls === undefined)
    return <p className="mt-6 text-ink-soft">{t('loading')}</p>;
  const open = calls.filter(
    (c) =>
      callWindowState(c, now) === 'open' &&
      !mine.some((a) => a.callId === c._id),
  );
  return (
    <div className="mt-8 space-y-10">
      <section aria-labelledby="my-apps-h">
        <h2 id="my-apps-h" className="font-display text-2xl">
          {t('myApplicationsTitle')}
        </h2>
        {mine.length === 0 ? (
          <p className="mt-3 text-ink-soft">{t('myApplicationsEmpty')}</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {mine.map((a) => (
              <li key={a._id} className={CARD}>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="min-w-0 wrap-anywhere font-medium text-ink">
                    {a.title}
                  </h3>
                  <StatusPill tone={statusTone(a.status)}>
                    {vocabulary(t, 'appStatus_', a.status)}
                  </StatusPill>
                </div>
                <p className="mt-1 wrap-anywhere text-[13px] text-ink-soft">
                  {a.callTitle}
                  {a.submittedAt
                    ? ` · ${t('submittedOn', { date: fmt(a.submittedAt) })}`
                    : ''}
                </p>
                {a.decisionNote ? (
                  <p className="mt-2 wrap-anywhere text-[14px] text-ink">
                    {t('decisionNote')} {a.decisionNote}
                  </p>
                ) : null}
                <Link
                  href={`/espace-membre/projets/${a.callSlug}`}
                  className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-accent-text hover:underline"
                >
                  {a.status === 'draft'
                    ? t('continueDraft')
                    : t('openApplication')}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="open-calls-h">
        <h2 id="open-calls-h" className="font-display text-2xl">
          {t('callsOpen')}
        </h2>
        {open.length === 0 ? (
          <p className="mt-3 text-ink-soft">{t('callsOpenEmpty')}</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {open.map((c) => (
              <li key={c._id}>
                <Link
                  href={`/espace-membre/projets/${c.slug}`}
                  className="inline-flex min-h-11 items-center wrap-anywhere font-medium text-accent-text hover:underline"
                >
                  {t('applyTo', { title: c.title })}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
