'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { PROGRAMME_LIMITS } from '@convex/lib/programmes';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormError, TextField, TextareaField } from '@/components/ui/field';
import { vocabulary } from '@/i18n/vocabulary';
import { MatchReasons } from '@/components/mentoring/match-reasons';
import {
  CARD,
  MemberPageHeader,
  StatusPill,
  statusTone,
  useDateFormat,
  useProgrammeError,
} from '@/components/programmes/shared';
import { Checkbox } from '@/components/ui/checkbox';

type Pair = FunctionReturnType<typeof api.mentoring.getPair>;

// Follow-up of a pair (F-59): goals, sessions, milestones, status, review. Its
// two members write; the coordinator reads (without the session notes) and
// can pause or close it.
export function PairDetail({ pairId }: { pairId: Id<'mentorPairs'> }) {
  const t = useTranslations('mentorship');
  const pair = useQuery(api.mentoring.getPair, { pairId });
  if (pair === undefined)
    return <p className="mt-6 text-ink-soft">{t('loading')}</p>;
  const member = pair.viewer !== 'coordinator';
  const open = pair.status === 'active' || pair.status === 'paused';
  return (
    <>
      <MemberPageHeader
        title={t('pairTitle', {
          mentor: pair.mentorName,
          mentee: pair.menteeName,
        })}
      />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StatusPill tone={statusTone(pair.status)}>
          {vocabulary(t, 'pairStatus_', pair.status)}
        </StatusPill>
        {pair.viewer === 'coordinator' ? (
          <StatusPill tone="neutral">{t('viewerCoordinator')}</StatusPill>
        ) : null}
      </div>
      {pair.counterpartEmail ? (
        <p className="mt-3 text-[14px] text-ink-soft">
          {t('contactLabel')}{' '}
          <a
            href={`mailto:${pair.counterpartEmail}`}
            className="break-all font-medium text-accent-text hover:underline"
          >
            {pair.counterpartEmail}
          </a>
        </p>
      ) : null}
      <div className="mt-8 space-y-8">
        {pair.status === 'proposed' && member ? <Respond pair={pair} /> : null}
        <section className={CARD} aria-labelledby="pair-why-h">
          <h2 id="pair-why-h" className="font-display text-xl">
            {t('whyTitle')}
          </h2>
          <div className="mt-3">
            <MatchReasons score={pair.score} reasons={pair.scoreReasons} />
          </div>
        </section>
        <Goals
          pair={pair}
          editable={
            member && pair.status !== 'ended' && pair.status !== 'declined'
          }
        />
        <Sessions pair={pair} canLog={member && open} />
        <Milestones
          pair={pair}
          editable={
            member && pair.status !== 'ended' && pair.status !== 'declined'
          }
        />
        {open ? <StatusControls pair={pair} /> : null}
        {pair.status === 'ended' ? (
          <FinalReview pair={pair} member={member} />
        ) : null}
      </div>
    </>
  );
}

function Respond({ pair }: { pair: Pair }) {
  const t = useTranslations('mentorship');
  const respond = useMutation(api.mentoring.respondToPair);
  const errorMessage = useProgrammeError();
  const [error, setError] = useState<string | null>(null);
  const mine =
    pair.viewer === 'mentor' ? pair.mentorAccepted : pair.menteeAccepted;
  if (mine)
    return <p className={`${CARD} text-ink-soft`}>{t('waitingOther')}</p>;
  const act = async (accept: boolean) => {
    setError(null);
    try {
      await respond({ pairId: pair._id, accept });
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <section className={`${CARD} border-accent-edge bg-accent-tint`}>
      <p className="text-ink">{t('proposedLead')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button className="min-h-11" onClick={() => act(true)}>
          {t('accept')}
        </Button>
        <Button
          variant="outline"
          className="min-h-11"
          onClick={() => act(false)}
        >
          {t('decline')}
        </Button>
      </div>
      <FormError className="mt-2">{error}</FormError>
    </section>
  );
}

function Goals({ pair, editable }: { pair: Pair; editable: boolean }) {
  const t = useTranslations('mentorship');
  const update = useMutation(api.mentoring.updatePairGoals);
  const errorMessage = useProgrammeError();
  const [goals, setGoals] = useState(pair.goals ?? '');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className={CARD} aria-labelledby="pair-goals-h">
      <h2 id="pair-goals-h" className="font-display text-xl">
        {t('goalsTitle')}
      </h2>
      {editable ? (
        <form
          className="mt-3 grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setStatus(null);
            try {
              await update({ pairId: pair._id, goals });
              setStatus(t('saved'));
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          <TextareaField
            label={t('goalsLabel')}
            id="pair-goals"
            rows={3}
            maxLength={PROGRAMME_LIMITS.goals}
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
          />
          <FormError>{error}</FormError>
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" className="min-h-11">
              {t('saveGoals')}
            </Button>
            {status ? (
              <span role="status" className="text-sm text-accent-text">
                {status}
              </span>
            ) : null}
          </div>
        </form>
      ) : (
        <p className="mt-2 wrap-anywhere text-ink-soft">
          {pair.goals || t('goalsEmpty')}
        </p>
      )}
    </section>
  );
}

function toDateInput(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function Sessions({ pair, canLog }: { pair: Pair; canLog: boolean }) {
  const t = useTranslations('mentorship');
  const fmt = useDateFormat();
  const log = useMutation(api.mentoring.logSession);
  const errorMessage = useProgrammeError();
  const [today] = useState(() => toDateInput(Date.now()));
  const [date, setDate] = useState(today);
  const [duration, setDuration] = useState('60');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setDone(false);
    // Noon UTC on the chosen day: the displayed date stays the same whatever
    // the time zone of whoever reads it back.
    const ms = Date.parse(`${date}T12:00:00Z`);
    if (!Number.isFinite(ms)) return setError(t('errDate'));
    try {
      await log({
        pairId: pair._id,
        date: Math.min(ms, Date.now()),
        durationMinutes: Number(duration),
        notes: notes.trim() || undefined,
      });
      setNotes('');
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section className={CARD} aria-labelledby="pair-sessions-h">
      <h2 id="pair-sessions-h" className="font-display text-xl">
        {t('sessionsTitle')}
      </h2>
      {pair.viewer === 'coordinator' ? (
        <p className="mt-1 text-[13px] text-muted">{t('notesPrivate')}</p>
      ) : null}
      {canLog ? (
        <form
          onSubmit={onSubmit}
          noValidate
          className="mt-3 grid gap-3 sm:grid-cols-2"
        >
          <TextField
            label={t('sessionDate')}
            id="session-date"
            type="date"
            required
            max={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <TextField
            label={t('sessionDuration')}
            id="session-duration"
            type="number"
            inputMode="numeric"
            min={5}
            max={PROGRAMME_LIMITS.maxSessionMinutes}
            required
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
          <TextareaField
            label={t('sessionNotes')}
            id="session-notes"
            className="sm:col-span-2"
            rows={3}
            maxLength={PROGRAMME_LIMITS.sessionNotes}
            hint={t('sessionNotesHint')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <FormError className="sm:col-span-2">{error}</FormError>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" size="sm" className="min-h-11">
              {t('logSession')}
            </Button>
            {done ? (
              <span role="status" className="text-sm text-accent-text">
                {t('sessionLogged')}
              </span>
            ) : null}
          </div>
        </form>
      ) : null}
      {pair.sessions.length === 0 ? (
        <p className="mt-3 text-ink-soft">{t('sessionsEmpty')}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {pair.sessions.map((s) => (
            <li key={s._id} className="py-3">
              <p className="text-sm font-medium text-ink">
                {t('sessionLine', {
                  date: fmt(s.date),
                  minutes: s.durationMinutes,
                })}
              </p>
              {s.notes ? (
                <p className="mt-1 wrap-anywhere text-[14px] text-ink-soft">
                  {s.notes}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Milestones({ pair, editable }: { pair: Pair; editable: boolean }) {
  const t = useTranslations('mentorship');
  const fmt = useDateFormat();
  const add = useMutation(api.mentoring.addMilestone);
  const toggle = useMutation(api.mentoring.setMilestoneDone);
  const errorMessage = useProgrammeError();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <section className={CARD} aria-labelledby="pair-milestones-h">
      <h2 id="pair-milestones-h" className="font-display text-xl">
        {t('milestonesTitle')}
      </h2>
      {pair.milestones.length === 0 ? (
        <p className="mt-2 text-ink-soft">{t('milestonesEmpty')}</p>
      ) : (
        <ul className="mt-3 space-y-1">
          {pair.milestones.map((m) => (
            <li key={m._id}>
              <label className="flex min-h-11 items-center gap-3 text-[15px] text-ink">
                <Checkbox
                  checked={m.doneAt !== null}
                  disabled={!editable}
                  onCheckedChange={async (checked) => {
                    setError(null);
                    try {
                      await toggle({
                        milestoneId: m._id,
                        done: checked === true,
                      });
                    } catch (err) {
                      setError(errorMessage(err));
                    }
                  }}
                />
                <span className="wrap-anywhere">{m.title}</span>
                {m.dueDate ? (
                  <span className="font-mono text-[11px] text-muted">
                    {t('dueOn', { date: fmt(m.dueDate) })}
                  </span>
                ) : null}
              </label>
            </li>
          ))}
        </ul>
      )}
      {editable ? (
        <form
          className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              await add({
                pairId: pair._id,
                title: title.trim(),
                dueDate: due ? Date.parse(`${due}T12:00:00Z`) : undefined,
              });
              setTitle('');
              setDue('');
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          <TextField
            label={t('milestoneTitle')}
            id="milestone-title"
            maxLength={PROGRAMME_LIMITS.shortText}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <TextField
            label={t('milestoneDue')}
            id="milestone-due"
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
          <Button type="submit" size="sm" className="min-h-11">
            {t('addMilestone')}
          </Button>
        </form>
      ) : null}
      <FormError className="mt-2">{error}</FormError>
    </section>
  );
}

function StatusControls({ pair }: { pair: Pair }) {
  const t = useTranslations('mentorship');
  const setStatus = useMutation(api.mentoring.setPairStatus);
  const errorMessage = useProgrammeError();
  const [error, setError] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [pending, setPending] = useState(false);
  const change = async (status: 'active' | 'paused' | 'ended') => {
    setError(null);
    setPending(true);
    try {
      await setStatus({ pairId: pair._id, status });
      setConfirmEnd(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <section className={CARD} aria-labelledby="pair-status-h">
      <h2 id="pair-status-h" className="font-display text-xl">
        {t('statusTitle')}
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {pair.status === 'active' ? (
          <Button
            variant="outline"
            className="min-h-11"
            disabled={pending}
            onClick={() => change('paused')}
          >
            {t('pause')}
          </Button>
        ) : (
          <Button
            variant="outline"
            className="min-h-11"
            disabled={pending}
            onClick={() => change('active')}
          >
            {t('resume')}
          </Button>
        )}
        <Button
          variant="destructive"
          className="min-h-11"
          disabled={pending}
          onClick={() => setConfirmEnd(true)}
        >
          {t('end')}
        </Button>
      </div>
      <FormError className="mt-2">{error}</FormError>
      <ConfirmDialog
        open={confirmEnd}
        title={t('endConfirmTitle')}
        description={t('endConfirmBody')}
        confirmLabel={t('end')}
        cancelLabel={t('cancel')}
        destructive
        pending={pending}
        onConfirm={() => change('ended')}
        onCancel={() => setConfirmEnd(false)}
      />
    </section>
  );
}

function FinalReview({ pair, member }: { pair: Pair; member: boolean }) {
  const t = useTranslations('mentorship');
  const submit = useMutation(api.mentoring.submitFinalReview);
  const errorMessage = useProgrammeError();
  const mine =
    pair.viewer === 'mentor'
      ? pair.mentorReview
      : pair.viewer === 'mentore'
        ? pair.menteeReview
        : null;
  const [review, setReview] = useState(mine ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  return (
    <section className={CARD} aria-labelledby="pair-review-h">
      <h2 id="pair-review-h" className="font-display text-xl">
        {t('reviewTitle')}
      </h2>
      <dl className="mt-3 space-y-3 text-[14px]">
        <div>
          <dt className="text-muted">{t('reviewMentor')}</dt>
          <dd className="wrap-anywhere text-ink">
            {pair.mentorReview ?? t('reviewNone')}
          </dd>
        </div>
        <div>
          <dt className="text-muted">{t('reviewMentee')}</dt>
          <dd className="wrap-anywhere text-ink">
            {pair.menteeReview ?? t('reviewNone')}
          </dd>
        </div>
      </dl>
      {member ? (
        <form
          className="mt-4 grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setSaved(false);
            try {
              await submit({ pairId: pair._id, review });
              setSaved(true);
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          <TextareaField
            label={t('reviewLabel')}
            id="pair-review"
            rows={4}
            maxLength={PROGRAMME_LIMITS.review}
            value={review}
            onChange={(e) => setReview(e.target.value)}
          />
          <FormError>{error}</FormError>
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" className="min-h-11">
              {t('reviewSubmit')}
            </Button>
            {saved ? (
              <span role="status" className="text-sm text-accent-text">
                {t('saved')}
              </span>
            ) : null}
          </div>
        </form>
      ) : null}
    </section>
  );
}
