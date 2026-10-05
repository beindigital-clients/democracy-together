'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { KOHOP_STAGES, KOHOP_ACCESS_MODES } from '@convex/lib/kohop';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FormError } from '@/components/ui/field';
import { SelectField } from '@/components/ui/choice-fields';
import { Checkbox } from '@/components/ui/checkbox';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useActionFeedback } from '@/components/admin/action-feedback';
import { StageBadge } from '@/components/kohop/stage-badge';
import { useKohopDates, useKohopError } from '@/components/kohop/use-kohop';
import { isAdmin } from '@/lib/roles';
import { vocabulary } from '@/i18n/vocabulary';

const QUEUE_STAGES = KOHOP_STAGES.filter((s) => s !== 'draft');

// PILOT ACCESS (D-15) — administrator only: deposits are reserved to the
// listed organizations, or open to every member. While the access is `pilot`,
// the public KOHOP pages are not indexed.
function PilotSettings() {
  const t = useTranslations('kohop');
  const settings = useQuery(api.kohopChief.getSettings, {});
  const save = useMutation(api.kohopChief.setSettings);
  const notify = useActionFeedback();
  const errorMessage = useKohopError();
  const [access, setAccess] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (settings === undefined) return null;

  const currentAccess = access ?? settings.access;
  const currentOrgs = orgs ?? settings.pilotOrganizations;
  const dirty = access !== null || orgs !== null;

  async function apply() {
    setBusy(true);
    setError('');
    try {
      await save({
        access: currentAccess === 'open' ? 'open' : 'pilot',
        pilotOrganizations: currentOrgs as Id<'organizations'>[],
      });
      setAccess(null);
      setOrgs(null);
      notify(t('settingsSaved'));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="kohop-pilot-settings"
      className="mt-10 rounded-md border border-line bg-surface p-5 sm:p-6"
    >
      <h2 id="kohop-pilot-settings" className="font-display text-xl text-ink">
        {t('pilotSettingsTitle')}
      </h2>
      <p className="mt-1 max-w-[68ch] text-sm text-ink-soft">
        {t('pilotSettingsLead')}
      </p>
      <div className="mt-4 max-w-sm">
        <SelectField
          label={t('accessLabel')}
          value={currentAccess}
          onValueChange={setAccess}
          options={KOHOP_ACCESS_MODES.map((m) => ({
            value: m,
            label: vocabulary(t, 'access_', m),
          }))}
        />
      </div>
      {currentAccess === 'pilot' ? (
        <fieldset className="mt-4">
          <legend className="text-sm text-ink-soft">
            {t('pilotOrganizations')}
          </legend>
          {settings.options.length === 0 ? (
            <p className="mt-2 text-sm text-muted">{t('noOrganizations')}</p>
          ) : (
            <ul className="mt-2 grid max-h-64 gap-1 overflow-y-auto rounded-md border border-line p-2 sm:grid-cols-2">
              {settings.options.map((o) => (
                <li key={o._id}>
                  <label className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-surface-2">
                    <Checkbox
                      checked={currentOrgs.includes(o._id)}
                      onCheckedChange={(checked) =>
                        setOrgs(
                          checked === true
                            ? [...currentOrgs, o._id]
                            : currentOrgs.filter((id) => id !== o._id),
                        )
                      }
                    />
                    <span className="min-w-0 wrap-anywhere">{o.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      ) : null}
      <div className="mt-4 flex items-center gap-3">
        <Button type="button" onClick={apply} disabled={!dirty || busy}>
          {t('saveSettings')}
        </Button>
        <FormError>{error}</FormError>
      </div>
    </section>
  );
}

export default function AdminKohop() {
  const t = useTranslations('kohop');
  const dates = useKohopDates();
  const me = useQuery(api.users.current);
  const [stage, setStage] = useState<string>('submitted');
  const queue = useQuery(api.kohopChief.queue, { stage });

  return (
    <div>
      <h1 className="font-display text-3xl">{t('chiefTitle')}</h1>
      <p className="mt-2 max-w-[68ch] text-ink-soft">{t('chiefLead')}</p>

      <ToggleGroup
        type="single"
        size="sm"
        value={stage}
        onValueChange={(v) => {
          if (v) setStage(v);
        }}
        aria-label={t('stageFilter')}
        className="mt-6 flex-wrap"
      >
        {QUEUE_STAGES.map((s) => (
          <ToggleGroupItem key={s} value={s}>
            {vocabulary(t, 'stage_', s)}
            {queue ? (
              <Badge
                size="count"
                variant={stage === s ? 'solid' : 'default'}
                className="ms-2"
              >
                {queue.counts[s] ?? 0}
              </Badge>
            ) : null}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {queue === undefined ? (
        <p className="mt-6 text-ink-soft" role="status">
          {t('loading')}
        </p>
      ) : queue.items.length === 0 ? (
        <p className="mt-6 text-ink-soft">{t('queueEmpty')}</p>
      ) : (
        <ul aria-label={t('queueList')} className="mt-6 space-y-3">
          {queue.items.map((c) => {
            const due = c.revisionDueAt ?? c.proofDueAt ?? c.returnedDueAt;
            return (
              <li key={c._id}>
                <Link
                  href={`/admin/kohop/${c._id}`}
                  className="block rounded-md border border-line bg-surface p-4 transition-colors hover:border-ink"
                >
                  <span className="flex flex-wrap items-start justify-between gap-3">
                    <span className="min-w-0 wrap-anywhere font-display text-lg text-ink">
                      {c.title || t('untitled')}
                    </span>
                    <StageBadge stage={c.stage} />
                  </span>
                  <span className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-soft">
                    <span>{c.authorName}</span>
                    {c.organization ? <span>{c.organization}</span> : null}
                    {c.submittedAt ? (
                      <span>
                        {t('submittedOn', { date: dates.day(c.submittedAt) })}
                      </span>
                    ) : null}
                    {due ? (
                      <span>{t('dueOn', { date: dates.day(due) })}</span>
                    ) : null}
                    <span>
                      {t('reviewersValidated', {
                        validated: c.reviewersApproved,
                        proposed: c.reviewersProposed,
                      })}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {isAdmin(me?.role) ? <PilotSettings /> : null}
    </div>
  );
}
