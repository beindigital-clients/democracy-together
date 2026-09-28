'use client';

import { useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { AuthGate } from '@/components/auth/auth-gate';
import { Link } from '@/i18n/navigation';
import { ProgressBar } from '@/components/ui/progress-bar';
import {
  CARD,
  MemberPageHeader,
  PAGE,
  useDateFormat,
} from '@/components/programmes/shared';

// My progress in the learning paths (F-57).
function Page() {
  const t = useTranslations('toolbox');
  const fmt = useDateFormat();
  const mine = useQuery(api.toolbox.myLearning);
  return (
    <div className={PAGE}>
      <MemberPageHeader
        title={t('myLearningTitle')}
        lead={t('myLearningLead')}
      />
      {mine === undefined ? (
        <p className="mt-6 text-ink-soft">{t('loading')}</p>
      ) : mine.length === 0 ? (
        <p className="mt-6 text-ink-soft">
          {t('myLearningEmpty')}{' '}
          <Link
            href="/boite-a-outils"
            className="font-medium text-accent-text hover:underline"
          >
            {t('browsePaths')}
          </Link>
        </p>
      ) : (
        <ul className="mt-8 space-y-3">
          {mine.map((e) => (
            <li key={e.enrollmentId} className={CARD}>
              <h2 className="wrap-anywhere font-medium text-ink">
                <Link
                  href={`/parcours/${e.pathSlug}`}
                  className="hover:underline"
                >
                  {e.pathTitle}
                </Link>
              </h2>
              <ProgressBar
                className="mt-3"
                label={t('progressLabel')}
                percent={e.steps ? Math.round((e.done / e.steps) * 100) : 0}
                text={t('progress', { done: e.done, total: e.steps })}
              />
              {e.completedAt ? (
                <p className="mt-3 text-[14px] text-ink-soft">
                  {t('completedOn', { date: fmt(e.completedAt) })}{' '}
                  <Link
                    href={`/espace-membre/parcours/attestation/${e.enrollmentId}`}
                    className="inline-flex min-h-11 items-center font-medium text-accent-text hover:underline"
                  >
                    {t('seeCertificate')}
                  </Link>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function MyLearningPage() {
  return (
    <AuthGate className="max-w-3xl">
      <Page />
    </AuthGate>
  );
}
