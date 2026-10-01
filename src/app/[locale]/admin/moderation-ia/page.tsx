'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  useAction,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import type { FunctionReturnType } from 'convex/server';
import {
  AI_MODES,
  AI_SEVERITIES,
  SETTINGS_BOUNDS,
  type AiMode,
  type AiSeverity,
} from '@convex/lib/aiModeration';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TextField, TextareaField } from '@/components/ui/field';
import { SelectField } from '@/components/ui/choice-fields';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { LoadMore } from '@/components/admin/load-more';
import { useActionFeedback } from '@/components/admin/action-feedback';
import { vocabulary } from '@/i18n/vocabulary';
import { isAdmin } from '@/lib/roles';
import { Checkbox } from '@/components/ui/checkbox';

// AI-ASSISTED MODERATION PANEL (administrator).
//
// This is the screen from which one decides that texts will be published without a
// human having read them. It is therefore organized around that decision, and not
// around the data structure:
//
//  1. the STATE FIRST — gateway key set or not, and what the current
//     mode implies. Arming auto-publication on a deployment without a key
//     is the easiest mistake to make and the longest to
//     diagnose: it is stated before everything else;
//  2. the RUBRIC NEXT, with its core displayed read-only. Seeing what
//     cannot be removed is part of knowing what one is configuring;
//  3. the TEST BENCH, because a criterion is drafted through successive trials.
//     Without it, the only way to test a wording would be to wait for
//     a real submission;
//  4. the LOG, which is the answer to "what did it actually do".
//
// The form is a local draft, sent on demand: a threshold
// change must not take effect on a keystroke, between two digits.

const PAGE_SIZE = 20;

type Settings = FunctionReturnType<typeof api.aiModeration.getSettings>;
type TestResult = FunctionReturnType<typeof api.aiModeration.testRuleset>;

// --- Settings ----------------------------------------------------------------

function SettingsForm({ data }: { data: Settings }) {
  const t = useTranslations('admin');
  const tl = useTranslations('library');
  const save = useMutation(api.aiModeration.updateSettings);
  const notify = useActionFeedback();

  const [form, setForm] = useState(data.settings);
  const [pending, setPending] = useState(false);

  // The settings are reactive (Convex): a write made elsewhere — another
  // tab, another administrator — must take over the draft,
  // otherwise the screen offers to save a stale version. We resync on
  // the version, not on the object: it is the version that changes on every write.
  useEffect(() => {
    setForm(data.settings);
  }, [data.settings]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      const { version } = await save({
        mode: form.mode,
        model: form.model,
        ...(form.fallbackModel ? { fallbackModel: form.fallbackModel } : {}),
        autoPublishMinConfidence: form.autoPublishMinConfidence,
        instructions: form.instructions,
        eligibleTypes: form.eligibleTypes,
        analyzeAttachments: form.analyzeAttachments,
        maxAttachmentMb: form.maxAttachmentMb,
        dailyCallCap: form.dailyCallCap,
      });
      notify(t('aiSaved', { version }));
    } catch {
      notify(t('aiSaveError'), 'error');
    } finally {
      setPending(false);
    }
  }

  function toggleType(type: string) {
    setForm((f) => ({
      ...f,
      eligibleTypes: f.eligibleTypes.includes(type)
        ? f.eligibleTypes.filter((x) => x !== type)
        : [...f.eligibleTypes, type],
    }));
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-6 space-y-5 rounded-md border border-line bg-surface p-5"
    >
      <h2 className="font-display text-xl">{t('aiSettingsTitle')}</h2>

      <SelectField
        label={t('aiModeLabel')}
        hint={vocabulary(t, 'aiModeHint_', form.mode)}
        value={form.mode}
        onValueChange={(v) => setForm((f) => ({ ...f, mode: v as AiMode }))}
        className="max-w-sm"
        options={AI_MODES.map((mode) => ({
          value: mode,
          label: vocabulary(t, 'aiMode_', mode),
        }))}
      />

      {/* Warning carried by the mode itself, and not relegated to the
          documentation: it is at the moment of choosing "auto" that it matters. */}
      {form.mode === 'auto' ? (
        <p
          role="status"
          className="rounded-sm border border-accent-edge bg-accent-tint p-3 text-sm text-accent-text"
        >
          {t('aiModeAutoWarning')}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={t('aiModelLabel')}
          hint={t('aiModelHint')}
          value={form.model}
          onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
          maxLength={120}
          required
        />
        <TextField
          label={t('aiFallbackLabel')}
          hint={t('aiFallbackHint')}
          value={form.fallbackModel ?? ''}
          onChange={(e) =>
            setForm((f) => ({ ...f, fallbackModel: e.target.value || null }))
          }
          maxLength={120}
        />
        <TextField
          label={t('aiConfidenceLabel', {
            min: SETTINGS_BOUNDS.confidence.min,
            max: SETTINGS_BOUNDS.confidence.max,
          })}
          hint={t('aiConfidenceHint')}
          type="number"
          min={SETTINGS_BOUNDS.confidence.min}
          max={SETTINGS_BOUNDS.confidence.max}
          value={form.autoPublishMinConfidence}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              autoPublishMinConfidence: Number(e.target.value),
            }))
          }
        />
        <TextField
          label={t('aiDailyCapLabel')}
          hint={t('aiDailyCapHint')}
          type="number"
          min={SETTINGS_BOUNDS.dailyCap.min}
          max={SETTINGS_BOUNDS.dailyCap.max}
          value={form.dailyCallCap}
          onChange={(e) =>
            setForm((f) => ({ ...f, dailyCallCap: Number(e.target.value) }))
          }
        />
      </div>

      <fieldset>
        <legend className="text-sm text-ink-soft">{t('aiScopeLabel')}</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {data.availableTypes.map((type) => (
            <label key={type} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.eligibleTypes.includes(type)}
                onCheckedChange={() => toggleType(type)}
              />
              {vocabulary(tl, 'types.', type)}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">{t('aiScopeHint')}</p>
      </fieldset>

      <fieldset>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={form.analyzeAttachments}
            onCheckedChange={(checked) =>
              setForm((f) => ({ ...f, analyzeAttachments: checked === true }))
            }
          />
          {t('aiAttachmentsLabel')}
        </label>
        <p className="mt-1 text-xs text-muted">{t('aiAttachmentsHint')}</p>
        <TextField
          label={t('aiMaxAttachmentLabel')}
          type="number"
          min={SETTINGS_BOUNDS.attachmentMb.min}
          max={SETTINGS_BOUNDS.attachmentMb.max}
          value={form.maxAttachmentMb}
          onChange={(e) =>
            setForm((f) => ({ ...f, maxAttachmentMb: Number(e.target.value) }))
          }
          className="mt-3 max-w-[16rem]"
        />
      </fieldset>

      <TextareaField
        label={t('aiInstructionsLabel')}
        hint={t('aiInstructionsHint')}
        placeholder={t('aiInstructionsPlaceholder')}
        rows={5}
        maxLength={SETTINGS_BOUNDS.instructionsMaxLength}
        value={form.instructions}
        onChange={(e) =>
          setForm((f) => ({ ...f, instructions: e.target.value }))
        }
      />

      <Button type="submit" disabled={pending}>
        {t('aiSave')}
      </Button>
    </form>
  );
}

// --- Rubric ------------------------------------------------------------------

type RuleDraft = {
  ruleId?: Id<'aiModerationRules'>;
  label: string;
  description: string;
  severity: AiSeverity;
  enabled: boolean;
};

const EMPTY_RULE: RuleDraft = {
  label: '',
  description: '',
  severity: 'warning',
  enabled: true,
};

function RuleEditor({
  draft,
  onDone,
}: {
  draft: RuleDraft;
  onDone: () => void;
}) {
  const t = useTranslations('admin');
  const upsert = useMutation(api.aiModeration.upsertRule);
  const notify = useActionFeedback();
  const [form, setForm] = useState(draft);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      await upsert({
        ...(form.ruleId ? { ruleId: form.ruleId } : {}),
        label: form.label,
        description: form.description,
        severity: form.severity,
        enabled: form.enabled,
      });
      onDone();
    } catch {
      notify(t('aiSaveError'), 'error');
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-sm border border-line bg-surface-2 p-4"
    >
      <TextField
        label={t('aiRuleLabelField')}
        value={form.label}
        onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
        maxLength={SETTINGS_BOUNDS.ruleLabelMaxLength}
        required
      />
      <TextareaField
        label={t('aiRuleDescriptionField')}
        placeholder={t('aiRuleDescriptionPlaceholder')}
        rows={3}
        maxLength={SETTINGS_BOUNDS.ruleDescriptionMaxLength}
        value={form.description}
        onChange={(e) =>
          setForm((f) => ({ ...f, description: e.target.value }))
        }
        required
      />
      <div className="flex flex-wrap items-end gap-4">
        <SelectField
          label={t('aiRuleSeverityField')}
          hint={vocabulary(t, 'aiSeverityHint_', form.severity)}
          value={form.severity}
          onValueChange={(v) =>
            setForm((f) => ({ ...f, severity: v as AiSeverity }))
          }
          className="max-w-[18rem]"
          options={AI_SEVERITIES.map((s) => ({
            value: s,
            label: vocabulary(t, 'aiSeverity_', s),
          }))}
        />
        <label className="flex items-center gap-2 pb-2 text-sm">
          <Checkbox
            checked={form.enabled}
            onCheckedChange={(checked) =>
              setForm((f) => ({ ...f, enabled: checked === true }))
            }
          />
          {t('aiRuleEnabledField')}
        </label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {form.ruleId ? t('aiRuleSave') : t('aiRuleCreate')}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          {t('aiRuleCancel')}
        </Button>
      </div>
    </form>
  );
}

function RuleRow({ rule }: { rule: Settings['rules'][number] }) {
  const t = useTranslations('admin');
  const remove = useMutation(api.aiModeration.deleteRule);
  const notify = useActionFeedback();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  if (editing) {
    return (
      <li>
        <RuleEditor
          draft={{
            ruleId: rule._id,
            label: rule.label,
            description: rule.description,
            severity: rule.severity,
            enabled: rule.enabled,
          }}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }

  async function onDelete() {
    setPending(true);
    try {
      await remove({ ruleId: rule._id });
      setConfirming(false);
    } catch {
      notify(t('aiSaveError'), 'error');
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="rounded-sm border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={rule.severity === 'blocking' ? 'accent' : 'default'}>
          {vocabulary(t, 'aiSeverity_', rule.severity)}
        </Badge>
        <span className="font-medium">{rule.label}</span>
        {rule.enabled ? null : (
          // The idle criterion SAYS so. These two keys used to say "Actif :
          // Toutes" — the field label followed by that of a list
          // filter, which read as the opposite of the displayed state.
          <span className="text-xs text-muted">{t('aiRuleDisabled')}</span>
        )}
      </div>
      <p className="mt-2 max-w-[72ch] text-sm text-ink-soft">
        {rule.description}
      </p>
      <div className="mt-3 flex gap-2">
        <Button variant="outline" onClick={() => setEditing(true)}>
          {t('aiRuleSave')}
        </Button>
        <Button variant="outline" onClick={() => setConfirming(true)}>
          {t('aiRuleDelete')}
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        title={t('aiConfirmDeleteRuleTitle', { label: rule.label })}
        description={t('aiConfirmDeleteRuleBody')}
        confirmLabel={t('aiConfirmDeleteRuleConfirm')}
        cancelLabel={t('confirmCancel')}
        destructive
        pending={pending}
        onConfirm={onDelete}
        onCancel={() => setConfirming(false)}
      />
    </li>
  );
}

function Ruleset({ data }: { data: Settings }) {
  const t = useTranslations('admin');
  const [adding, setAdding] = useState(false);

  return (
    <section className="mt-8">
      <h2 className="font-display text-xl">{t('aiRulesTitle')}</h2>
      <p className="mt-2 max-w-[72ch] text-sm text-ink-soft">
        {t('aiRulesIntro')}
      </p>

      {data.rules.length === 0 && !adding ? (
        <p className="mt-4 text-ink-soft">{t('aiRulesEmpty')}</p>
      ) : (
        <ul aria-label={t('aiRulesTitle')} className="mt-4 space-y-3">
          {data.rules.map((rule) => (
            <RuleRow key={rule._id} rule={rule} />
          ))}
        </ul>
      )}

      {adding ? (
        <div className="mt-3">
          <RuleEditor draft={EMPTY_RULE} onDone={() => setAdding(false)} />
        </div>
      ) : (
        <Button className="mt-4" onClick={() => setAdding(true)}>
          {t('aiRuleAdd')}
        </Button>
      )}

      <h3 className="mt-8 font-display text-lg">{t('aiBaselineTitle')}</h3>
      <p className="mt-1 max-w-[72ch] text-sm text-ink-soft">
        {t('aiBaselineIntro')}
      </p>
      <ul aria-label={t('aiBaselineTitle')} className="mt-3 space-y-2">
        {data.baseline.map((rule) => (
          <li
            key={rule.key}
            className="rounded-sm border border-dashed border-line p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{vocabulary(t, 'aiSeverity_', rule.severity)}</Badge>
              <span className="text-sm font-medium">{rule.label}</span>
            </div>
            <p className="mt-1 max-w-[72ch] text-xs text-muted">
              {rule.description}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

// --- Test bench ------------------------------------------------------------

function TestBench() {
  const t = useTranslations('admin');
  const run = useAction(api.aiModeration.testRuleset);
  const [title, setTitle] = useState('');
  const [abstract, setAbstract] = useState('');
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setResult(null);
    try {
      setResult(
        await run({ title, abstract, ...(body.trim() ? { body } : {}) }),
      );
    } catch {
      /* refused server-side (role): the screen does not insist */
    } finally {
      setPending(false);
    }
  }

  const signals = result?.findings.filter((f) => f.outcome !== 'pass') ?? [];

  return (
    <section className="mt-8">
      <h2 className="font-display text-xl">{t('aiTestTitle')}</h2>
      <p className="mt-2 max-w-[72ch] text-sm text-ink-soft">
        {t('aiTestIntro')}
      </p>
      <form
        onSubmit={onSubmit}
        className="mt-4 space-y-4 rounded-md border border-line bg-surface p-5"
      >
        <TextField
          label={t('aiTestTitleField')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={300}
          required
        />
        <TextareaField
          label={t('aiTestAbstractField')}
          rows={4}
          value={abstract}
          onChange={(e) => setAbstract(e.target.value)}
          required
        />
        <TextareaField
          label={t('aiTestBodyField')}
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Button type="submit" disabled={pending}>
          {pending ? t('aiTestRunning') : t('aiTestRun')}
        </Button>
      </form>

      {result ? (
        <div
          role="status"
          className="mt-4 rounded-md border border-line bg-surface-2 p-5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={result.verdict === 'approve' ? 'accent' : 'default'}
            >
              {vocabulary(t, 'aiVerdict_', result.verdict)}
            </Badge>
            <span className="text-xs text-muted">
              {t('aiConfidenceValue', { value: result.confidence })}
            </span>
          </div>
          <p className="mt-2 text-sm font-medium">
            {result.wouldAutoPublish
              ? t('aiTestWouldPublish')
              : t('aiTestWouldEscalate', {
                  reason: vocabulary(t, 'aiReason_', result.reason),
                })}
          </p>
          {result.summary ? (
            <p className="mt-2 max-w-[72ch] text-sm text-ink-soft">
              {result.summary}
            </p>
          ) : null}
          {result.error ? (
            <p className="mt-2 text-sm text-muted">
              {t('aiTestError', { code: result.error })}
            </p>
          ) : null}
          {signals.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {signals.map((f) => (
                <li key={f.ruleKey} className="text-sm">
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={f.severity === 'blocking' ? 'accent' : 'default'}
                    >
                      {vocabulary(t, 'aiSeverity_', f.severity)}
                    </Badge>
                    <span className="font-medium">{f.ruleLabel}</span>
                    <span className="text-xs text-muted">
                      {vocabulary(t, 'aiOutcome_', f.outcome)}
                    </span>
                  </span>
                  <p className="mt-1 max-w-[72ch] text-ink-soft">
                    {f.explanation}
                  </p>
                  {f.quote ? (
                    <blockquote className="mt-1 border-s-2 border-line ps-3 text-xs italic text-muted">
                      {f.quote}
                    </blockquote>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

// --- Log -----------------------------------------------------------------

function DecisionLog() {
  const t = useTranslations('admin');
  const { results, status, loadMore } = usePaginatedQuery(
    api.aiModeration.listReviews,
    {},
    { initialNumItems: PAGE_SIZE },
  );

  return (
    <section className="mt-8">
      <h2 className="font-display text-xl">{t('aiLogTitle')}</h2>
      {status === 'LoadingFirstPage' ? (
        <p className="mt-3 text-ink-soft">{t('loading')}</p>
      ) : results.length === 0 ? (
        <p className="mt-3 text-ink-soft">{t('aiLogEmpty')}</p>
      ) : (
        <>
          <ul aria-label={t('aiLogListLabel')} className="mt-4 space-y-2">
            {results.map((review) => (
              <li
                key={review._id}
                className="rounded-sm border border-line bg-surface p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      review.applied === 'published' ? 'accent' : 'default'
                    }
                  >
                    {vocabulary(t, 'aiApplied_', review.applied)}
                  </Badge>
                  {/* Missing title = deleted submission: say so, rather than
                      display the raw identifier (27/09, m-7). */}
                  <span
                    className={
                      review.publicationTitle
                        ? 'wrap-anywhere font-medium'
                        : 'italic text-muted'
                    }
                  >
                    {review.publicationTitle ?? t('aiLogDeletedPublication')}
                  </span>
                  <span className="text-xs text-muted">
                    {vocabulary(t, 'aiVerdict_', review.verdict)} ·{' '}
                    {vocabulary(t, 'aiReason_', review.reason)}
                  </span>
                </div>
                {review.summary ? (
                  <p className="mt-1 max-w-[72ch] text-sm text-ink-soft">
                    {review.summary}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-muted">
                  {t('aiModelUsed', { model: review.model })}
                  {review.error ? ` · ${review.error}` : ''}
                </p>
              </li>
            ))}
          </ul>
          <LoadMore status={status} loadMore={loadMore} pageSize={PAGE_SIZE} />
        </>
      )}
    </section>
  );
}

// --- Screen -------------------------------------------------------------------

export default function AdminAiModeration() {
  const t = useTranslations('admin');
  const me = useQuery(api.users.current);
  // The role is read BEFORE the settings: `getSettings` rejects a non-admin
  // server-side, and a query that throws renders the error screen, not a message. Same
  // guard as at /admin/utilisateurs — the real authorization stays server-side.
  const admin = isAdmin(me?.role);
  const data = useQuery(api.aiModeration.getSettings, admin ? {} : 'skip');

  if (me === undefined) {
    return (
      <div>
        <h1 className="font-display text-3xl">{t('aiTitle')}</h1>
        <p className="mt-6 text-ink-soft">{t('loading')}</p>
      </div>
    );
  }
  if (!admin) {
    return (
      <div>
        <h1 className="font-display text-3xl">{t('aiTitle')}</h1>
        <p className="mt-6 text-ink-soft">{t('usersOnlyAdmin')}</p>
      </div>
    );
  }
  if (data === undefined) {
    return (
      <div>
        <h1 className="font-display text-3xl">{t('aiTitle')}</h1>
        <p className="mt-6 text-ink-soft">{t('loading')}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-3xl">{t('aiTitle')}</h1>
      <p className="mt-2 max-w-[72ch] text-ink-soft">{t('aiIntro')}</p>

      {/* The key state comes BEFORE the settings: configuring a mechanism that
          cannot call anyone is the costliest way to discover
          that an environment variable is missing. */}
      <p
        role="status"
        className={`mt-4 rounded-sm border p-3 text-sm ${
          data.configured
            ? 'border-line bg-surface-2 text-ink-soft'
            : 'border-accent-edge bg-accent-tint text-accent-text'
        }`}
      >
        {data.configured ? t('aiConfiguredOk') : t('aiNotConfigured')}
      </p>

      {/* The three labels are written out in full rather than iterated with
          `.map()`: the issue #33 guard rejects a key built at
          runtime, and `vocabulary()` does not fit here — these are not
          terms coming from the database, but three fixed headings. */}
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-sm border border-line p-3">
          <dt className="text-xs text-muted">{t('aiStatsAnalyzed')}</dt>
          <dd className="font-display text-2xl">{data.stats.analyzed}</dd>
        </div>
        <div className="rounded-sm border border-line p-3">
          <dt className="text-xs text-muted">{t('aiStatsPublished')}</dt>
          <dd className="font-display text-2xl">{data.stats.published}</dd>
        </div>
        <div className="rounded-sm border border-line p-3">
          <dt className="text-xs text-muted">{t('aiStatsEscalated')}</dt>
          <dd className="font-display text-2xl">{data.stats.escalated}</dd>
        </div>
      </dl>

      <SettingsForm data={data} />
      <Ruleset data={data} />
      <TestBench />
      <DecisionLog />
    </div>
  );
}
