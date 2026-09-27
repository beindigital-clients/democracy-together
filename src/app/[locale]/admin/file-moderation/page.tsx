'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import {
  MODERATION_REASON,
  type ModerationTarget,
} from '@convex/lib/communaute';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SelectField, TextareaField } from '@/components/ui/field';
import { useActionFeedback } from '@/components/admin/action-feedback';
import { STATUS_PILL } from '@/components/tribune/my-posts';
import { PUB_THEMES } from '@/lib/publications';
import { intlLocale } from '@/i18n/locale';
import { vocabulary } from '@/i18n/vocabulary';

// FILE DE MODÉRATION UNIFIÉE DE LA TRIBUNE (F-45, F-49) — modérateur et
// au-dessus (garde Convex : `requireNetworkRole(ctx, 'moderateur')`).
//
// Onglets : en attente, validés, rejetés, retirés, signalés. Filtres : type
// de contenu, axe, format. Pour chaque contenu, l'HISTORIQUE COMPLET —
// soumission, avis de l'IA, décisions, signalements, modifications — avec
// l'auteur et l'heure de chaque fait. Les décisions négatives exigent un
// motif (montré à l'auteur) et passent par une confirmation qui nomme la
// cible (issue #38).

type Tab = 'pending' | 'published' | 'rejected' | 'removed' | 'reported';
const TABS: readonly Tab[] = [
  'pending',
  'published',
  'rejected',
  'removed',
  'reported',
];

type Selected = { targetType: ModerationTarget; targetId: string };

function useDate() {
  const locale = intlLocale(useLocale());
  return (ms: number) =>
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(ms);
}

// Réglage du mode : lu par tout le staff, modifiable par l'administrateur.
function ModeSettings({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations('moderationQueue');
  const settings = useQuery(api.communityModeration.getSettings);
  const update = useMutation(api.communityModeration.updateSettings);
  const notify = useActionFeedback();
  const [draft, setDraft] = useState<{
    postMode: 'a_priori' | 'a_posteriori';
    commentMode: 'a_priori' | 'a_posteriori';
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!settings) return null;
  const current = draft ?? settings;
  const changed =
    current.postMode !== settings.postMode ||
    current.commentMode !== settings.commentMode;

  async function save() {
    setBusy(true);
    try {
      await update(current);
      notify(t('settingsSaved'));
      setDraft(null);
    } catch {
      notify(t('actionFailed'), 'error');
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  const modeLabel = (m: 'a_priori' | 'a_posteriori') =>
    m === 'a_priori' ? t('modeAPriori') : t('modeAPosteriori');

  return (
    <section
      aria-labelledby="mq-settings"
      className="mt-6 rounded-md border border-line bg-surface p-4"
    >
      <h2 id="mq-settings" className="font-display text-lg">
        {t('settingsTitle')}
      </h2>
      {isAdmin ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <SelectField
            label={t('postModeLabel')}
            id="mq-post-mode"
            value={current.postMode}
            onChange={(e) =>
              setDraft({
                ...current,
                postMode:
                  e.target.value === 'a_posteriori'
                    ? 'a_posteriori'
                    : 'a_priori',
              })
            }
          >
            <option value="a_priori">{t('modeAPriori')}</option>
            <option value="a_posteriori">{t('modeAPosteriori')}</option>
          </SelectField>
          <SelectField
            label={t('commentModeLabel')}
            id="mq-comment-mode"
            value={current.commentMode}
            onChange={(e) =>
              setDraft({
                ...current,
                commentMode:
                  e.target.value === 'a_priori' ? 'a_priori' : 'a_posteriori',
              })
            }
          >
            <option value="a_priori">{t('modeAPriori')}</option>
            <option value="a_posteriori">{t('modeAPosteriori')}</option>
          </SelectField>
          <Button
            type="button"
            className="min-h-11"
            disabled={!changed || busy}
            onClick={() => setConfirming(true)}
          >
            {t('settingsApply')}
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-sm text-ink-soft">
          {t('settingsReadOnly', {
            posts: modeLabel(settings.postMode),
            comments: modeLabel(settings.commentMode),
          })}
        </p>
      )}
      <p className="mt-2 text-xs text-muted">{t('settingsHint')}</p>
      <ConfirmDialog
        open={confirming}
        title={t('settingsConfirmTitle')}
        description={t('settingsConfirmBody', {
          posts: modeLabel(current.postMode),
          comments: modeLabel(current.commentMode),
        })}
        confirmLabel={t('settingsApply')}
        cancelLabel={t('cancel')}
        pending={busy}
        onConfirm={save}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}

function historyLabel(t: (key: string) => string, kind: string): string {
  switch (kind) {
    case 'submitted':
      return t('ev_submitted');
    case 'edited':
      return t('ev_edited');
    case 'ai_review':
      return t('ev_ai_review');
    case 'ai_published':
      return t('ev_ai_published');
    case 'approved':
      return t('ev_approved');
    case 'rejected':
      return t('ev_rejected');
    case 'removed':
      return t('ev_removed');
    case 'reported':
      return t('ev_reported');
    case 'reports_dismissed':
      return t('ev_reports_dismissed');
    default:
      return kind;
  }
}

function ItemDetail({ selected }: { selected: Selected }) {
  const t = useTranslations('moderationQueue');
  const tt = useTranslations('tribune');
  const ta = useTranslations('admin');
  const fmt = useDate();
  const item = useQuery(api.communityModeration.getItem, selected);
  const decide = useMutation(api.communityModeration.decide);
  const dismiss = useMutation(api.communityModeration.dismissReports);
  const notify = useActionFeedback();
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState<'reject' | 'remove' | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [reasonError, setReasonError] = useState<string | null>(null);

  if (item === undefined)
    return <p className="text-ink-soft">{t('loading')}</p>;
  if (item === null) return <p className="text-ink-soft">{t('notFound')}</p>;

  async function act(decision: 'approve' | 'reject' | 'remove') {
    setBusy(true);
    try {
      await decide({
        targetType: selected.targetType,
        targetId: selected.targetId,
        decision,
        ...(decision === 'approve' ? {} : { reason: reason.trim() }),
      });
      notify(
        decision === 'approve'
          ? t('approvedFeedback', { title: item!.title })
          : decision === 'reject'
            ? t('rejectedFeedback', { title: item!.title })
            : t('removedFeedback', { title: item!.title }),
      );
      setReason('');
    } catch (err) {
      notify(
        err instanceof ConvexError && err.data === 'INVALID_TRANSITION'
          ? t('alreadyDecided')
          : t('actionFailed'),
        'error',
      );
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  function askNegative(decision: 'reject' | 'remove') {
    const r = reason.trim();
    if (r.length < MODERATION_REASON.min || r.length > MODERATION_REASON.max) {
      setReasonError(t('reasonRequired', { min: MODERATION_REASON.min }));
      return;
    }
    setReasonError(null);
    setConfirming(decision);
  }

  async function onDismiss() {
    setBusy(true);
    try {
      await dismiss(selected);
      notify(t('reportsDismissedFeedback'));
    } catch {
      notify(t('actionFailed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  const target =
    item.targetType === 'post' ? t('targetPost') : t('targetComment');

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span
          className={`rounded-pill border px-2.5 py-0.5 font-medium ${STATUS_PILL[item.status]}`}
        >
          {vocabulary(tt, 'status_', item.status)}
        </span>
        <Badge>{target}</Badge>
        <span className="font-mono text-muted">
          {vocabulary(tt, 'format_', item.format)}
        </span>
        {item.openReports > 0 ? (
          <Badge variant="outline">
            {t('openReports', { count: item.openReports })}
          </Badge>
        ) : null}
      </div>
      <h2 className="mt-3 wrap-anywhere font-display text-xl">
        {item.targetType === 'comment'
          ? t('commentOn', { title: item.postTitle })
          : item.title}
      </h2>
      <p className="mt-1 font-mono text-[11px] text-muted">
        {t('byLine', { name: item.authorName, date: fmt(item.createdAt) })}
      </p>
      {item.parent ? (
        <p className="mt-2 text-sm text-ink-soft">
          {tt('deepensLabel')}{' '}
          <span className="wrap-anywhere font-medium text-ink">
            {item.parent.title}
          </span>
        </p>
      ) : null}
      {item.status === 'published' ? (
        <Link
          href={`/tribune/${item.postId}`}
          className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-accent-text hover:underline"
        >
          {t('viewPublic')}
        </Link>
      ) : null}
      <div className="mt-4 max-h-[50vh] overflow-y-auto whitespace-pre-line wrap-anywhere rounded-md border border-line bg-surface-2 p-4 text-[15px] leading-relaxed text-ink">
        {item.body}
      </div>
      {item.rejectionReason ? (
        <p className="mt-3 wrap-anywhere text-sm text-ink-soft">
          {tt('reasonLabel', { reason: item.rejectionReason })}
        </p>
      ) : null}

      {/* Décisions */}
      <div className="mt-5 space-y-3 rounded-md border border-line bg-surface p-4">
        {item.status === 'pending' || item.status === 'published' ? (
          <TextareaField
            label={t('reasonLabel')}
            id="mq-reason"
            value={reason}
            rows={2}
            maxLength={MODERATION_REASON.max}
            hint={t('reasonHint')}
            error={reasonError}
            onChange={(e) => setReason(e.target.value)}
          />
        ) : null}
        <div className="flex flex-wrap gap-2">
          {item.status !== 'published' ? (
            <Button
              type="button"
              className="min-h-11"
              disabled={busy}
              onClick={() => act('approve')}
            >
              {item.status === 'pending' ? t('approve') : t('restore')}
            </Button>
          ) : null}
          {item.status === 'pending' ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={busy}
              onClick={() => askNegative('reject')}
            >
              {t('reject')}
            </Button>
          ) : null}
          {item.status === 'published' ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={busy}
              onClick={() => askNegative('remove')}
            >
              {t('remove')}
            </Button>
          ) : null}
          {item.openReports > 0 ? (
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              disabled={busy}
              onClick={onDismiss}
            >
              {t('dismissReports')}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Historique complet */}
      <section aria-labelledby="mq-history" className="mt-6">
        <h3 id="mq-history" className="font-display text-lg">
          {t('historyTitle')}
        </h3>
        <ol className="mt-3 space-y-3 border-s border-line ps-4">
          {item.history.map((h) => (
            <li key={h._id} className="text-sm">
              <p className="font-medium text-ink">
                {historyLabel(t, h.kind)}
                {h.statusTo ? (
                  <span className="font-normal text-ink-soft">
                    {' '}
                    — {vocabulary(tt, 'status_', h.statusTo)}
                  </span>
                ) : null}
              </p>
              <p className="font-mono text-[11px] text-muted">
                {h.actorName ?? (h.ai ? t('actorAi') : t('actorUnknown'))} ·{' '}
                {fmt(h.createdAt)}
              </p>
              {h.reason ? (
                <p className="mt-1 wrap-anywhere text-ink-soft">
                  {tt('reasonLabel', { reason: h.reason })}
                </p>
              ) : null}
              {h.ai ? (
                <div className="mt-2 rounded-sm border border-line bg-surface-2 p-3">
                  <p className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        h.ai.verdict === 'approve' ? 'accent' : 'default'
                      }
                    >
                      {vocabulary(ta, 'aiVerdict_', h.ai.verdict)}
                    </Badge>
                    <span className="text-xs text-muted">
                      {vocabulary(ta, 'aiApplied_', h.ai.applied)}
                      {h.ai.verdict === 'error'
                        ? ''
                        : ` · ${ta('aiConfidenceValue', { value: h.ai.confidence })}`}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {vocabulary(ta, 'aiReason_', h.ai.reason)}
                  </p>
                  {h.ai.summary ? (
                    <p className="mt-2 wrap-anywhere text-ink-soft">
                      {h.ai.summary}
                    </p>
                  ) : null}
                  {h.ai.error ? (
                    <p className="mt-1 text-xs text-muted">
                      {ta('aiTestError', { code: h.ai.error })}
                    </p>
                  ) : null}
                  <ul className="mt-2 space-y-1">
                    {h.ai.findings
                      .filter((f) => f.outcome !== 'pass')
                      .map((f) => (
                        <li key={f.ruleKey} className="text-xs text-ink-soft">
                          <span className="font-medium text-ink">
                            {f.ruleLabel}
                          </span>{' '}
                          · {vocabulary(ta, 'aiSeverity_', f.severity)} ·{' '}
                          {vocabulary(ta, 'aiOutcome_', f.outcome)} —{' '}
                          <span className="wrap-anywhere">{f.explanation}</span>
                        </li>
                      ))}
                  </ul>
                  <p className="mt-1 text-xs text-muted">
                    {ta('aiModelUsed', { model: h.ai.model })}
                  </p>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <ConfirmDialog
        open={confirming !== null}
        title={
          confirming === 'reject'
            ? item.targetType === 'post'
              ? t('confirmRejectPost')
              : t('confirmRejectComment')
            : item.targetType === 'post'
              ? t('confirmRemovePost')
              : t('confirmRemoveComment')
        }
        description={t('confirmBody', {
          title: item.title,
          reason: reason.trim(),
        })}
        confirmLabel={confirming === 'reject' ? t('reject') : t('remove')}
        cancelLabel={t('cancel')}
        destructive
        pending={busy}
        onConfirm={() => (confirming ? act(confirming) : undefined)}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}

function ModerationQueue() {
  const t = useTranslations('moderationQueue');
  const tt = useTranslations('tribune');
  const tl = useTranslations('library');
  const ta = useTranslations('admin');
  const fmt = useDate();
  const params = useSearchParams();
  const me = useQuery(api.users.current);
  // Lien profond (notification « l'IA signale… ») : ?type=post&id=…
  const deepType = params?.get('type');
  const deepId = params?.get('id');
  const [selected, setSelected] = useState<Selected | null>(
    deepId && (deepType === 'post' || deepType === 'comment')
      ? { targetType: deepType, targetId: deepId }
      : null,
  );
  const [tab, setTab] = useState<Tab>('pending');
  const [targetType, setTargetType] = useState<'' | ModerationTarget>('');
  const [theme, setTheme] = useState('');
  const [format, setFormat] = useState<'' | 'court' | 'fond'>('');

  const items = useQuery(api.communityModeration.listQueue, {
    tab,
    ...(targetType ? { targetType } : {}),
    ...(theme ? { theme } : {}),
    ...(format ? { format } : {}),
  });
  const counts = useQuery(api.communityModeration.queueCounts);

  const tabLabel = (k: Tab) => {
    switch (k) {
      case 'pending':
        return t('tab_pending');
      case 'published':
        return t('tab_published');
      case 'rejected':
        return t('tab_rejected');
      case 'removed':
        return t('tab_removed');
      case 'reported':
        return t('tab_reported');
    }
  };
  const tabCount = (k: Tab) =>
    k === 'pending'
      ? counts?.pending
      : k === 'reported'
        ? counts?.reported
        : undefined;

  return (
    <div>
      <h1 className="font-display text-3xl">{t('title')}</h1>
      <p className="mt-2 max-w-[70ch] text-ink-soft">{t('lead')}</p>

      <ModeSettings isAdmin={me?.role === 'admin'} />

      <div
        role="group"
        aria-label={t('tabsLabel')}
        className="mt-6 flex flex-wrap gap-2"
      >
        {TABS.map((k) => {
          const n = tabCount(k);
          return (
            <Button
              key={k}
              type="button"
              size="sm"
              variant={tab === k ? 'default' : 'outline'}
              className="min-h-11"
              aria-pressed={tab === k}
              onClick={() => {
                setTab(k);
                setSelected(null);
              }}
            >
              {tabLabel(k)}
              {n !== undefined && n > 0 ? ` (${n > 100 ? '100+' : n})` : ''}
            </Button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <SelectField
          label={t('filterType')}
          id="mq-type"
          value={targetType}
          onChange={(e) =>
            setTargetType(
              e.target.value === 'post' || e.target.value === 'comment'
                ? e.target.value
                : '',
            )
          }
        >
          <option value="">{t('filterAll')}</option>
          <option value="post">{t('targetPost')}</option>
          <option value="comment">{t('targetComment')}</option>
        </SelectField>
        <SelectField
          label={t('filterTheme')}
          id="mq-theme"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
        >
          <option value="">{t('filterAll')}</option>
          {PUB_THEMES.map((s) => (
            <option key={s} value={s}>
              {vocabulary(tl, 'themes.', s)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('filterFormat')}
          id="mq-format"
          value={format}
          onChange={(e) =>
            setFormat(
              e.target.value === 'court' || e.target.value === 'fond'
                ? e.target.value
                : '',
            )
          }
        >
          <option value="">{t('filterAll')}</option>
          <option value="court">{tt('format_court')}</option>
          <option value="fond">{tt('format_fond')}</option>
        </SelectField>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div>
          {items === undefined ? (
            <p className="text-ink-soft">{t('loading')}</p>
          ) : items.length === 0 ? (
            <p className="text-ink-soft">{t('empty')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((i) => {
                const active =
                  selected?.targetId === i.targetId &&
                  selected.targetType === i.targetType;
                return (
                  <li key={`${i.targetType}:${i.targetId}`}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setSelected({
                          targetType: i.targetType,
                          targetId: i.targetId,
                        })
                      }
                      className={`block w-full min-h-11 rounded-md border p-3 text-start transition-colors ${
                        active
                          ? 'border-accent bg-accent-tint'
                          : 'border-line bg-surface hover:border-line-strong'
                      }`}
                    >
                      <span className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="rounded-pill border border-line-strong px-2 py-0.5 font-mono uppercase tracking-[0.06em] text-muted">
                          {i.targetType === 'post'
                            ? t('targetPost')
                            : t('targetComment')}
                        </span>
                        {i.isDeepening ? (
                          <span className="font-mono text-muted">
                            {tt('deepeningBadge')}
                          </span>
                        ) : null}
                        {i.openReports > 0 ? (
                          <span className="font-mono text-bar-5">
                            {t('openReports', { count: i.openReports })}
                          </span>
                        ) : null}
                        {i.aiReview ? (
                          <span className="font-mono text-muted">
                            {t('aiBadge', {
                              verdict: vocabulary(
                                ta,
                                'aiVerdict_',
                                i.aiReview.verdict,
                              ),
                              blocking: i.aiReview.blocking,
                            })}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block wrap-anywhere font-medium text-ink">
                        {i.targetType === 'comment'
                          ? t('commentOn', { title: i.title })
                          : i.title}
                      </span>
                      <span className="mt-0.5 block wrap-anywhere text-[13px] text-ink-soft line-clamp-2">
                        {i.excerpt}
                      </span>
                      <span className="mt-1 block font-mono text-[11px] text-muted">
                        {t('byLine', {
                          name: i.authorName,
                          date: fmt(i.createdAt),
                        })}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="rounded-md border border-line bg-surface p-5">
          {selected ? (
            <ItemDetail
              key={`${selected.targetType}:${selected.targetId}`}
              selected={selected}
            />
          ) : (
            <p className="text-ink-soft">{t('selectPrompt')}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// `useSearchParams` (lien profond depuis une notification) exige une
// frontière Suspense pour le rendu statique de la coquille.
export default function ModerationQueuePage() {
  return (
    <Suspense fallback={null}>
      <ModerationQueue />
    </Suspense>
  );
}
