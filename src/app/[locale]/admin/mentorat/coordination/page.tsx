'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { useActionFeedback } from '@/components/admin/action-feedback';
import { vocabulary } from '@/i18n/vocabulary';
import { MatchReasons } from '@/components/mentoring/match-reasons';
import {
  StatusPill,
  statusTone,
  useDateFormat,
  useProgrammeError,
} from '@/components/programmes/shared';

// Coordination du mentorat (F-59) — rang modérateur. Pour chaque mentoré sans
// binôme : les mentors suggérés avec leur score expliqué ; le coordinateur
// confirme, puis les deux parties acceptent depuis leur espace. Les binômes
// inactifs (aucune séance depuis quatre semaines) sont signalés.
export default function MentoringCoordination() {
  const t = useTranslations('mentorship');
  const tl = useTranslations('library');
  const fmt = useDateFormat();
  // L'heure vient du client (une query ne lit pas l'horloge) et avance à la
  // minute : un binôme qui devient inactif pendant la consultation le dit.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const overview = useQuery(api.mentoring.coordinationOverview, {
    now: Math.floor(now / 60_000) * 60_000,
  });
  const [openMentee, setOpenMentee] = useState<Id<'mentorProfiles'> | null>(
    null,
  );

  if (overview === undefined)
    return <p className="text-ink-soft">{t('loading')}</p>;

  const inactive = overview.pairs.filter((p) => p.inactive);

  return (
    <div>
      <p className="text-sm">
        <Link
          href="/admin/mentorat"
          className="text-accent-text hover:underline"
        >
          {t('adminBackRequests')}
        </Link>
      </p>
      <h1 className="mt-2 font-display text-3xl">{t('coordinationTitle')}</h1>
      <p className="mt-2 max-w-[65ch] text-[15px] text-ink-soft">
        {t('coordinationLead')}
      </p>

      {inactive.length > 0 ? (
        <div
          role="status"
          className="mt-5 rounded-md border border-[color-mix(in_srgb,var(--color-bar-5)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-bar-5)_8%,transparent)] p-4 text-[14px] text-ink"
        >
          {t('inactiveBanner', { count: inactive.length })}
        </div>
      ) : null}

      <section className="mt-8" aria-labelledby="coord-mentees-h">
        <h2 id="coord-mentees-h" className="font-display text-2xl">
          {t('unmatchedTitle')}
        </h2>
        {overview.unmatchedMentees.length === 0 ? (
          <p className="mt-3 text-ink-soft">{t('unmatchedEmpty')}</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {overview.unmatchedMentees.map((m) => (
              <li
                key={m._id}
                className="rounded-md border border-line bg-surface p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="min-w-0 wrap-anywhere font-medium text-ink">
                    {m.displayName}
                  </h3>
                  <span className="text-[13px] text-ink-soft">
                    {vocabulary(t, 'regions.', m.region)} ·{' '}
                    {m.languages
                      .map((l) => vocabulary(tl, 'langs.', l))
                      .join(', ')}
                  </span>
                </div>
                <p className="mt-1 text-[13px] text-accent-text">
                  {m.themes
                    .map((s) => vocabulary(tl, 'themes.', s))
                    .join(' · ')}
                </p>
                <p className="mt-2 wrap-anywhere text-[14px] text-ink">
                  {m.goals}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 min-h-11"
                  aria-expanded={openMentee === m._id}
                  onClick={() =>
                    setOpenMentee(openMentee === m._id ? null : m._id)
                  }
                >
                  {t('showSuggestions')}
                </Button>
                {openMentee === m._id ? (
                  <Suggestions
                    menteeProfileId={m._id}
                    menteeName={m.displayName}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-labelledby="coord-pairs-h">
        <h2 id="coord-pairs-h" className="font-display text-2xl">
          {t('pairsAdminTitle')}
        </h2>
        {overview.pairs.length === 0 ? (
          <p className="mt-3 text-ink-soft">{t('pairsEmpty')}</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {overview.pairs.map((p) => (
              <li
                key={p._id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface p-3"
              >
                <span className="min-w-0 wrap-anywhere font-medium text-ink">
                  {t('pairNames', {
                    mentor: p.mentorName,
                    mentee: p.menteeName,
                  })}
                </span>
                <StatusPill tone={statusTone(p.status)}>
                  {vocabulary(t, 'pairStatus_', p.status)}
                </StatusPill>
                {p.inactive ? (
                  <StatusPill tone="bad">{t('inactive')}</StatusPill>
                ) : null}
                {p.status === 'proposed' ? (
                  <span className="text-[13px] text-ink-soft">
                    {t('acceptances', {
                      mentor: p.mentorAccepted ? '✓' : '…',
                      mentee: p.menteeAccepted ? '✓' : '…',
                    })}
                  </span>
                ) : null}
                <span className="font-mono text-[11px] text-muted">
                  {p.lastSessionAt
                    ? t('lastSession', { date: fmt(p.lastSessionAt) })
                    : t('noSession')}
                </span>
                <span className="flex-1" />
                <Link
                  href={`/espace-membre/mentorat/${p._id}`}
                  className="inline-flex min-h-11 items-center text-sm font-medium text-accent-text hover:underline"
                >
                  {t('openPair')}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-labelledby="coord-mentors-h">
        <h2 id="coord-mentors-h" className="font-display text-2xl">
          {t('mentorsTitle')}
        </h2>
        {overview.mentors.length === 0 ? (
          <p className="mt-3 text-ink-soft">{t('mentorsEmpty')}</p>
        ) : (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {overview.mentors.map((m) => (
              <li
                key={m._id}
                className="rounded-md border border-line bg-surface p-3 text-[14px]"
              >
                <span className="font-medium text-ink">{m.displayName}</span>
                <span className="ms-2 text-ink-soft">
                  {t('mentorLoad', {
                    active: m.openPairs,
                    capacity: m.capacity,
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Suggestions({
  menteeProfileId,
  menteeName,
}: {
  menteeProfileId: Id<'mentorProfiles'>;
  menteeName: string;
}) {
  const t = useTranslations('mentorship');
  const suggestions = useQuery(api.mentoring.suggestMentors, {
    menteeProfileId,
  });
  const propose = useMutation(api.mentoring.proposePair);
  const notify = useActionFeedback();
  const errorMessage = useProgrammeError();
  const [busy, setBusy] = useState(false);
  if (suggestions === undefined)
    return <p className="mt-3 text-ink-soft">{t('loading')}</p>;
  if (suggestions.length === 0)
    return <p className="mt-3 text-ink-soft">{t('noSuggestions')}</p>;
  return (
    <ol
      className="mt-4 space-y-3"
      aria-label={t('suggestionsFor', { name: menteeName })}
    >
      {suggestions.map((s) => (
        <li
          key={s.mentorProfileId}
          className="rounded-md border border-line bg-paper p-3"
        >
          <p className="font-medium text-ink">{s.displayName}</p>
          <div className="mt-2">
            <MatchReasons score={s.score} reasons={s.reasons} />
          </div>
          <Button
            size="sm"
            className="mt-3 min-h-11"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await propose({
                  menteeProfileId,
                  mentorProfileId: s.mentorProfileId,
                });
                notify(
                  t('proposedFeedback', {
                    mentor: s.displayName,
                    mentee: menteeName,
                  }),
                );
              } catch (err) {
                notify(errorMessage(err), 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('proposePair', { name: s.displayName })}
          </Button>
        </li>
      ))}
    </ol>
  );
}
