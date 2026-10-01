'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { FIELD_MAX } from '@convex/lib/validation';
import {
  CALL_TIME_ZONES,
  PROGRAMME_LANGUAGES,
  PROGRAMME_LIMITS,
  PROGRAMME_THEMES,
  utcToZonedInput,
  zonedInputToUtc,
  type CallDecision,
} from '@convex/lib/programmes';
import type { SiteLocale } from '@convex/lib/locales';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormError, TextField, TextareaField } from '@/components/ui/field';
import { ComboboxField } from '@/components/ui/choice-fields';
import { timeZoneChoices } from '@/lib/time-zones';
import { useActionFeedback } from '@/components/admin/action-feedback';
import { vocabulary } from '@/i18n/vocabulary';
import {
  CheckGroup,
  StatusPill,
  statusTone,
  useDateFormat,
  useProgrammeError,
} from '@/components/programmes/shared';
import {
  CallWindowLine,
  useFundFormat,
} from '@/components/projects/calls-list';
import { AttachmentLink } from '@/components/projects/evaluations-board';
import { Checkbox } from '@/components/ui/checkbox';

type AdminCall = FunctionReturnType<
  typeof api.projectCalls.adminListCalls
>[number];

// Dated calls for projects (F-60) — moderator rank: drafting, publication,
// evaluators, ranking and decisions.
export default function AdminProjectCalls() {
  const t = useTranslations('projects');
  const calls = useQuery(api.projectCalls.adminListCalls);
  const [editing, setEditing] = useState<AdminCall | 'new' | null>(null);
  const [now] = useState(() => Date.now());

  return (
    <div>
      <p className="text-sm">
        <Link
          href="/admin/projets"
          className="text-accent-text hover:underline"
        >
          {t('adminBackProposals')}
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">{t('adminCallsTitle')}</h1>
        {editing === null ? (
          <Button className="min-h-11" onClick={() => setEditing('new')}>
            {t('newCall')}
          </Button>
        ) : null}
      </div>
      {editing !== null ? (
        <CallEditor
          call={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      ) : null}
      {calls === undefined ? (
        <p className="mt-4 text-ink-soft">{t('loading')}</p>
      ) : calls.length === 0 ? (
        <p className="mt-4 text-ink-soft">{t('adminCallsEmpty')}</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {calls.map((c) => (
            <CallRow
              key={c._id}
              call={c}
              now={now}
              onEdit={() => setEditing(c)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CallRow({
  call,
  now,
  onEdit,
}: {
  call: AdminCall;
  now: number;
  onEdit: () => void;
}) {
  const t = useTranslations('projects');
  const fund = useFundFormat();
  const setStatus = useMutation(api.projectCalls.setCallStatus);
  const notify = useActionFeedback();
  const errorMessage = useProgrammeError();
  const [panel, setPanel] = useState<'evaluators' | 'ranking' | null>(null);
  return (
    <li className="rounded-md border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="min-w-0 wrap-anywhere font-medium text-ink">
          {call.title}
        </h2>
        <StatusPill tone={call.status === 'published' ? 'good' : 'neutral'}>
          {vocabulary(t, 'callStatus_', call.status)}
        </StatusPill>
        <span className="font-mono text-sm text-accent-text">
          {fund(call.fundAmount, call.fundCurrency)}
        </span>
      </div>
      <div className="mt-1">
        <CallWindowLine call={call} now={now} />
      </div>
      <p className="mt-1 text-[13px] text-muted">
        {t('adminCallCounts', {
          applications: call.applications,
          evaluators: call.evaluators.length,
        })}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="min-h-11"
          onClick={onEdit}
        >
          {t('editCall')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="min-h-11"
          onClick={async () => {
            try {
              await setStatus({
                callId: call._id,
                status: call.status === 'published' ? 'draft' : 'published',
              });
              notify(
                call.status === 'published'
                  ? t('callUnpublished', { title: call.title })
                  : t('callPublished', { title: call.title }),
              );
            } catch (err) {
              notify(errorMessage(err), 'error');
            }
          }}
        >
          {call.status === 'published' ? t('unpublishCall') : t('publishCall')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="min-h-11"
          aria-expanded={panel === 'evaluators'}
          onClick={() => setPanel(panel === 'evaluators' ? null : 'evaluators')}
        >
          {t('evaluatorsTitle')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="min-h-11"
          aria-expanded={panel === 'ranking'}
          onClick={() => setPanel(panel === 'ranking' ? null : 'ranking')}
        >
          {t('rankingTitle')}
        </Button>
        {call.status === 'published' ? (
          <Link
            href={`/appels-a-projets/${call.slug}`}
            className="inline-flex min-h-11 items-center text-sm text-accent-text hover:underline"
          >
            {t('seeCall')}
          </Link>
        ) : null}
      </div>
      {panel === 'evaluators' ? <Evaluators call={call} /> : null}
      {panel === 'ranking' ? <Ranking callId={call._id} /> : null}
    </li>
  );
}

function Evaluators({ call }: { call: AdminCall }) {
  const t = useTranslations('projects');
  const add = useMutation(api.projectCalls.addEvaluator);
  const remove = useMutation(api.projectCalls.removeEvaluator);
  const notify = useActionFeedback();
  const errorMessage = useProgrammeError();
  const [email, setEmail] = useState('');
  return (
    <div className="mt-4 rounded-sm border border-line bg-paper p-3">
      <p className="text-[13px] text-muted">{t('evaluatorsLead')}</p>
      {call.evaluators.length === 0 ? (
        <p className="mt-2 text-[14px] text-ink-soft">{t('evaluatorsEmpty')}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {call.evaluators.map((e) => (
            <li
              key={e.userId}
              className="flex flex-wrap items-center gap-2 text-[14px]"
            >
              <span className="wrap-anywhere text-ink">{e.name}</span>
              <span className="break-all text-muted">{e.email}</span>
              <Button
                size="sm"
                variant="ghost"
                className="min-h-11"
                onClick={async () => {
                  try {
                    await remove({ callId: call._id, userId: e.userId });
                  } catch (err) {
                    notify(errorMessage(err), 'error');
                  }
                }}
              >
                {t('removeEvaluator')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await add({ callId: call._id, email });
            setEmail('');
            notify(t('evaluatorAdded'));
          } catch (err) {
            notify(errorMessage(err), 'error');
          }
        }}
      >
        <TextField
          className="min-w-[220px] flex-1"
          label={t('evaluatorEmail')}
          id={`ev-email-${call._id}`}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" size="sm" className="min-h-11">
          {t('addEvaluator')}
        </Button>
      </form>
    </div>
  );
}

function Ranking({ callId }: { callId: Id<'projectCalls'> }) {
  const t = useTranslations('projects');
  const fmt = useDateFormat();
  const rows = useQuery(api.projectCalls.callRanking, { callId });
  const decide = useMutation(api.projectCalls.decideCallApplication);
  const reopen = useMutation(api.projectCalls.reopenCallApplication);
  const notify = useActionFeedback();
  const errorMessage = useProgrammeError();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<{
    id: Id<'projectCallApplications'>;
    title: string;
    decision: CallDecision;
  } | null>(null);
  // Going back on a decision (issue #9): the applicant was notified of it,
  // and is notified of this too — hence a confirmation that names the project.
  const [reopening, setReopening] = useState<{
    id: Id<'projectCallApplications'>;
    title: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  if (rows === undefined)
    return <p className="mt-3 text-ink-soft">{t('loading')}</p>;
  if (rows.length === 0)
    return <p className="mt-3 text-ink-soft">{t('rankingEmpty')}</p>;
  return (
    <div className="mt-4">
      <ol className="space-y-3">
        {rows.map((r) => (
          <li
            key={r._id}
            className="rounded-sm border border-line bg-paper p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-muted">#{r.rank}</span>
              <span className="min-w-0 wrap-anywhere font-medium text-ink">
                {r.title}
              </span>
              <StatusPill tone={statusTone(r.status)}>
                {vocabulary(t, 'appStatus_', r.status)}
              </StatusPill>
            </div>
            <p className="mt-1 wrap-anywhere text-[13px] text-ink-soft">
              {r.applicantName} ·{' '}
              {r.average === null
                ? t('noScore')
                : t('averageScore', { score: r.average })}{' '}
              · {t('evaluationsCount', { count: r.evaluations })}
              {r.excluded
                ? ` · ${t('excludedCount', { count: r.excluded })}`
                : ''}
            </p>
            <p className="mt-2 line-clamp-4 whitespace-pre-line wrap-anywhere text-[14px] text-ink">
              {r.summary}
            </p>
            {r.attachments.length ? (
              <ul className="mt-1 flex flex-wrap gap-x-4 text-[14px]">
                {r.attachments.map((f) => (
                  <li key={f._id}>
                    <AttachmentLink id={f._id} label={f.fileName} />
                  </li>
                ))}
              </ul>
            ) : null}
            {/* Back under review: the previous decision, and its note,
                stay in sight while the new one is being made. */}
            {r.status === 'submitted' && r.reopenedFrom !== null ? (
              <p className="mt-1 text-[13px] text-muted">
                {t('reopenedOn', {
                  date: fmt(r.reopenedAt ?? 0),
                  previous: r.reopenedFrom,
                })}
              </p>
            ) : null}
            {r.decisionNote ? (
              <p className="mt-1 wrap-anywhere text-[13px] text-muted">
                {r.status === 'submitted'
                  ? t('previousDecisionNote')
                  : t('decisionNote')}{' '}
                {r.decisionNote}
              </p>
            ) : null}
            {r.status === 'submitted' || r.status === 'waitlisted' ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Input
                  value={notes[r._id] ?? ''}
                  onChange={(e) =>
                    setNotes((n) => ({ ...n, [r._id]: e.target.value }))
                  }
                  aria-label={t('decisionNotePlaceholder')}
                  placeholder={t('decisionNotePlaceholder')}
                  className="max-w-xs"
                />
                {(['selected', 'waitlisted', 'rejected'] as const)
                  .filter(
                    (d) => !(r.status === 'waitlisted' && d === 'waitlisted'),
                  )
                  .map((d) => (
                    <Button
                      key={d}
                      size="sm"
                      variant={d === 'selected' ? 'default' : 'outline'}
                      className="min-h-11"
                      onClick={() =>
                        setPending({ id: r._id, title: r.title, decision: d })
                      }
                    >
                      {vocabulary(t, 'decide_', d)}
                    </Button>
                  ))}
              </div>
            ) : null}
            {r.status === 'selected' ||
            r.status === 'waitlisted' ||
            r.status === 'rejected' ? (
              <div className="mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => setReopening({ id: r._id, title: r.title })}
                >
                  {t('reopen')}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ol>
      <ConfirmDialog
        open={pending !== null}
        title={
          pending
            ? t('decisionConfirmTitle', {
                decision: vocabulary(t, 'decide_', pending.decision),
                title: pending.title,
              })
            : ''
        }
        description={t('decisionConfirmBody')}
        confirmLabel={pending ? vocabulary(t, 'decide_', pending.decision) : ''}
        cancelLabel={t('cancel')}
        destructive={pending?.decision === 'rejected'}
        pending={busy}
        onConfirm={async () => {
          if (!pending) return;
          setBusy(true);
          try {
            await decide({
              applicationId: pending.id,
              decision: pending.decision,
              note: notes[pending.id]?.trim() || undefined,
            });
            notify(
              t('decisionDone', {
                title: pending.title,
                decision: vocabulary(t, 'appStatus_', pending.decision),
              }),
            );
            setPending(null);
          } catch (err) {
            notify(errorMessage(err), 'error');
          } finally {
            setBusy(false);
          }
        }}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={reopening !== null}
        title={
          reopening ? t('reopenConfirmTitle', { title: reopening.title }) : ''
        }
        description={t('reopenConfirmBody')}
        confirmLabel={t('reopen')}
        cancelLabel={t('cancel')}
        pending={busy}
        onConfirm={async () => {
          if (!reopening) return;
          setBusy(true);
          try {
            await reopen({ applicationId: reopening.id });
            notify(t('reopenDone', { title: reopening.title }));
            setReopening(null);
          } catch (err) {
            notify(errorMessage(err), 'error');
          } finally {
            setBusy(false);
          }
        }}
        onCancel={() => setReopening(null)}
      />
    </div>
  );
}

type Row = { key: string; label: string; weight: string; required: boolean };

function CallEditor({
  call,
  onDone,
}: {
  call: AdminCall | null;
  onDone: () => void;
}) {
  const t = useTranslations('projects');
  const tl = useTranslations('library');
  const save = useMutation(api.projectCalls.saveCall);
  const notify = useActionFeedback();
  const errorMessage = useProgrammeError();
  const [timeZone, setTimeZone] = useState(call?.timeZone ?? 'Africa/Dakar');
  const [title, setTitle] = useState(call?.title ?? '');
  const [summary, setSummary] = useState(call?.summary ?? '');
  const [opens, setOpens] = useState(
    call ? utcToZonedInput(call.opensAt, call.timeZone) : '',
  );
  const [closes, setCloses] = useState(
    call ? utcToZonedInput(call.closesAt, call.timeZone) : '',
  );
  const [amount, setAmount] = useState(call ? String(call.fundAmount) : '');
  const [currency, setCurrency] = useState(call?.fundCurrency ?? 'EUR');
  const [themes, setThemes] = useState<string[]>(call?.themes ?? []);
  const [languages, setLanguages] = useState<string[]>(
    call?.languages ?? ['fr'],
  );
  const [criteria, setCriteria] = useState<Row[]>(
    call?.criteria.map((c) => ({
      key: c.key,
      label: c.label,
      weight: String(c.weight),
      required: true,
    })) ?? [{ key: '', label: '', weight: '1', required: true }],
  );
  const [documents, setDocuments] = useState<Row[]>(
    call?.requiredDocuments.map((d) => ({
      key: d.key,
      label: d.label,
      weight: '1',
      required: d.required,
    })) ?? [{ key: '', label: '', weight: '1', required: true }],
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const opensAt = zonedInputToUtc(opens, timeZone);
    const closesAt = zonedInputToUtc(closes, timeZone);
    if (!Number.isFinite(opensAt) || !Number.isFinite(closesAt))
      return setError(t('errWindow'));
    setPending(true);
    try {
      await save({
        callId: call?._id,
        title: title.trim(),
        summary: summary.trim(),
        opensAt,
        closesAt,
        timeZone,
        fundAmount: Number(amount),
        fundCurrency: currency.trim(),
        themes,
        languages: languages as SiteLocale[],
        criteria: criteria
          .filter((c) => c.label.trim())
          .map((c) => ({
            key: c.key,
            label: c.label.trim(),
            weight: Number(c.weight),
          })),
        requiredDocuments: documents
          .filter((d) => d.label.trim())
          .map((d) => ({
            key: d.key,
            label: d.label.trim(),
            required: d.required,
          })),
      });
      notify(t('callSaved', { title: title.trim() }));
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  const rowsEditor = (
    kind: 'criteria' | 'documents',
    rows: Row[],
    setRows: (rows: Row[]) => void,
    max: number,
  ) => (
    <fieldset className="sm:col-span-2">
      <legend className="text-sm text-ink-soft">
        {kind === 'criteria' ? t('criteriaEditor') : t('documentsEditor')}
      </legend>
      <ul className="mt-2 space-y-2">
        {rows.map((r, i) => (
          <li key={i} className="flex flex-wrap items-end gap-2">
            <TextField
              className="min-w-[200px] flex-1"
              labelHidden
              label={
                kind === 'criteria'
                  ? t('criterionLabel', { n: i + 1 })
                  : t('documentLabel', { n: i + 1 })
              }
              id={`${kind}-${i}`}
              placeholder={
                kind === 'criteria'
                  ? t('criterionLabel', { n: i + 1 })
                  : t('documentLabel', { n: i + 1 })
              }
              maxLength={PROGRAMME_LIMITS.shortText}
              value={r.label}
              onChange={(e) =>
                setRows(
                  rows.map((x, j) =>
                    j === i ? { ...x, label: e.target.value } : x,
                  ),
                )
              }
            />
            {kind === 'criteria' ? (
              <TextField
                className="w-28"
                label={t('weight')}
                id={`${kind}-w-${i}`}
                type="number"
                min={1}
                max={10}
                value={r.weight}
                onChange={(e) =>
                  setRows(
                    rows.map((x, j) =>
                      j === i ? { ...x, weight: e.target.value } : x,
                    ),
                  )
                }
              />
            ) : (
              <label className="flex min-h-11 items-center gap-2 text-sm text-ink-soft">
                <Checkbox
                  checked={r.required}
                  onCheckedChange={(checked) =>
                    setRows(
                      rows.map((x, j) =>
                        j === i ? { ...x, required: checked === true } : x,
                      ),
                    )
                  }
                />
                {t('docRequired')}
              </label>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-11"
              disabled={rows.length === 1}
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
            >
              {t('removeRow')}
            </Button>
          </li>
        ))}
      </ul>
      {rows.length < max ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-2 min-h-11"
          onClick={() =>
            setRows([
              ...rows,
              { key: '', label: '', weight: '1', required: true },
            ])
          }
        >
          {kind === 'criteria' ? t('addCriterion') : t('addDocument')}
        </Button>
      ) : null}
    </fieldset>
  );

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="mt-6 grid gap-4 rounded-md border border-accent-edge bg-surface p-5 sm:grid-cols-2"
      aria-label={call ? t('editCall') : t('newCall')}
    >
      <h2 className="font-display text-xl sm:col-span-2">
        {call ? t('editCall') : t('newCall')}
      </h2>
      <TextField
        label={t('callTitleField')}
        id="call-title"
        className="sm:col-span-2"
        required
        maxLength={PROGRAMME_LIMITS.shortText}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <TextareaField
        label={t('callSummary')}
        id="call-summary"
        className="sm:col-span-2"
        rows={5}
        required
        maxLength={FIELD_MAX.body}
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
      />
      {/* Every IANA zone, the usual ones first: searchable by city. */}
      <ComboboxField
        label={t('timeZoneLabel')}
        id="call-tz"
        value={timeZone}
        onValueChange={setTimeZone}
        options={timeZoneChoices(CALL_TIME_ZONES, timeZone).map((z) => ({
          value: z,
          label: z,
        }))}
        placeholder={t('timeZoneLabel')}
        searchLabel={t('timeZoneSearchLabel')}
        searchPlaceholder={t('timeZoneSearchPlaceholder')}
        noResults={t('timeZoneNoResults')}
      />
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <TextField
          label={t('fundAmount')}
          id="call-fund"
          type="number"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <TextField
          label={t('fundCurrency')}
          id="call-currency"
          maxLength={3}
          value={currency}
          onChange={(e) => setCurrency(e.target.value.toUpperCase())}
        />
      </div>
      <TextField
        label={t('opensAt')}
        id="call-opens"
        type="datetime-local"
        required
        hint={t('inTimeZone', { tz: timeZone })}
        value={opens}
        onChange={(e) => setOpens(e.target.value)}
      />
      <TextField
        label={t('closesAt')}
        id="call-closes"
        type="datetime-local"
        required
        hint={t('inTimeZone', { tz: timeZone })}
        value={closes}
        onChange={(e) => setCloses(e.target.value)}
      />
      <CheckGroup
        className="sm:col-span-2"
        legend={t('themesLabel')}
        options={PROGRAMME_THEMES.map((s) => ({
          value: s,
          label: vocabulary(tl, 'themes.', s),
        }))}
        value={themes}
        onChange={setThemes}
      />
      <CheckGroup
        className="sm:col-span-2"
        legend={t('languagesLabel')}
        options={PROGRAMME_LANGUAGES.map((l) => ({
          value: l,
          label: vocabulary(tl, 'langs.', l),
        }))}
        value={languages}
        onChange={setLanguages}
      />
      {rowsEditor(
        'criteria',
        criteria,
        setCriteria,
        PROGRAMME_LIMITS.maxCriteria,
      )}
      {rowsEditor(
        'documents',
        documents,
        setDocuments,
        PROGRAMME_LIMITS.maxDocuments,
      )}
      <FormError className="sm:col-span-2">{error}</FormError>
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {t('saveCall')}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}
