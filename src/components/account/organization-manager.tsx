'use client';

import { useState, type FormEvent } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import type { FunctionReturnType } from 'convex/server';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { DIRECTORY_THEMES, REGIONS } from '@convex/lib/directory';
import { Link } from '@/i18n/navigation';
import { AuthGate } from '@/components/auth/auth-gate';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  FormError,
  SelectField,
  TextField,
  TextareaField,
} from '@/components/ui/field';
import { MemberPageHeader } from '@/components/member/page-header';
import { errorCode } from '@/lib/account-errors';
import { formatLongDate } from '@/lib/publications';
import { vocabulary } from '@/i18n/vocabulary';
import { resolveLocale } from '@/i18n/locale';

// MANAGING ONE'S ORGANIZATION (F-21, accounts workstream).
//
// The MANAGER proposes changes to the entry (reviewed by a moderator),
// manages affiliations and invites colleagues; a regular member views it
// and can leave. The server decides every right (convex/orgAdmin.ts):
// this screen merely avoids offering what would be refused.

const ERRORS = [
  'NOT_ORG_OWNER',
  'NOT_ORG_MEMBER',
  'LAST_ORG_OWNER',
  'ALREADY_MEMBER',
  'ORG_MEMBER_LIMIT',
  'INVALID_EMAIL',
  'ACCOUNT_SUSPENDED',
  'RATE_LIMITED',
  'INVALID_NAME',
  'INVALID_DESCRIPTION',
  'INVALID_WEBSITE',
  'INVALID_COUNTRY_CODE',
  'INVALID_REGION',
  'INVALID_THEMES',
  'INVALID_LANGUAGES',
  'INVALID_LOGO',
  'LOGO_TOO_LARGE',
  'LOGO_TYPE',
  'LOGO_MISSING',
] as const;

const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp';
const LOGO_MAX_BYTES = 1024 * 1024;

type Labels = {
  regionLabels: Record<string, string>;
  themeLabels: Record<string, string>;
};

function useErrorText() {
  const t = useTranslations('orgAdmin');
  return (reasonOrError: unknown): string => {
    const code =
      typeof reasonOrError === 'string'
        ? reasonOrError
        : errorCode(reasonOrError, ERRORS);
    return code
      ? vocabulary(t, 'err_', code, t('errGeneric'))
      : t('errGeneric');
  };
}

type OrgView = FunctionReturnType<typeof api.orgAdmin.organizationForMember>;

function FicheForm({ view, labels }: { view: OrgView; labels: Labels }) {
  const t = useTranslations('orgAdmin');
  const errorText = useErrorText();
  const submit = useMutation(api.orgAdmin.submitRevision);
  const uploadUrl = useMutation(api.orgAdmin.generateLogoUploadUrl);
  const attachLogo = useAction(api.orgAdmin.attachLogo);
  const base = view.pendingRevision?.fields ?? {
    name: view.org.name,
    description: view.org.description ?? undefined,
    websiteUrl: view.org.websiteUrl ?? undefined,
    country: view.org.country,
    region: view.org.region,
    themes: view.org.themes,
    languages: view.org.languages,
    showMembers: view.org.showMembers,
  };
  const [name, setName] = useState(base.name);
  const [description, setDescription] = useState(base.description ?? '');
  const [websiteUrl, setWebsiteUrl] = useState(base.websiteUrl ?? '');
  const [country, setCountry] = useState(base.country);
  const [region, setRegion] = useState(base.region);
  const [themes, setThemes] = useState<string[]>(base.themes);
  const [languages, setLanguages] = useState(base.languages.join(', '));
  const [showMembers, setShowMembers] = useState(base.showMembers);
  const [logo, setLogo] = useState<{
    fileId: Id<'_storage'>;
    preview?: string;
  } | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onLogo(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (file.size > LOGO_MAX_BYTES) {
      setError(errorText('LOGO_TOO_LARGE'));
      return;
    }
    setUploading(true);
    try {
      const url = await uploadUrl({ orgId: view.org._id });
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!res.ok) throw new Error('upload');
      const { storageId } = (await res.json()) as {
        storageId: Id<'_storage'>;
      };
      // The CONTENT is checked server-side (image signature): that check is
      // what decides, not the type announced by the browser.
      const check = await attachLogo({
        orgId: view.org._id,
        fileId: storageId,
      });
      if (!check.ok) {
        setError(errorText(check.reason));
        return;
      }
      setLogo({ fileId: storageId, preview: check.url ?? undefined });
      setRemoveLogo(false);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setDone(false);
    try {
      await submit({
        orgId: view.org._id,
        fields: {
          name,
          description: description.trim() || undefined,
          websiteUrl: websiteUrl.trim() || undefined,
          country,
          region,
          themes,
          languages: languages
            .split(/[,\s]+/)
            .map((l) => l.trim().toLowerCase())
            .filter(Boolean),
          showMembers,
        },
        ...(logo ? { logoFileId: logo.fileId } : {}),
        ...(removeLogo ? { removeLogo: true } : {}),
      });
      setDone(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  const currentLogo = logo?.preview ?? view.org.logoUrl;

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="mt-6 rounded-md border border-line bg-surface p-5"
      aria-labelledby="fiche-title"
    >
      <h2 id="fiche-title" className="font-display text-xl">
        {t('ficheTitle')}
      </h2>
      <p className="mt-1 max-w-[65ch] text-sm text-ink-soft">
        {t('ficheHint')}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <TextField
          label={t('fieldName')}
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          className="sm:col-span-2"
          required
        />
        <TextareaField
          label={t('fieldDescription')}
          value={description}
          maxLength={4000}
          rows={4}
          onChange={(e) => setDescription(e.target.value)}
          className="sm:col-span-2"
        />
        <TextField
          label={t('fieldWebsite')}
          type="url"
          dir="ltr"
          value={websiteUrl}
          placeholder="https://"
          onChange={(e) => setWebsiteUrl(e.target.value)}
        />
        <TextField
          label={t('fieldCountry')}
          hint={t('fieldCountryHint')}
          value={country}
          maxLength={2}
          dir="ltr"
          onChange={(e) => setCountry(e.target.value.toUpperCase())}
          controlClassName="max-w-[8rem]"
        />
        <SelectField
          label={t('fieldRegion')}
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        >
          <option value="">—</option>
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {labels.regionLabels[r] ?? r}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t('fieldLanguages')}
          hint={t('fieldLanguagesHint')}
          value={languages}
          dir="ltr"
          onChange={(e) => setLanguages(e.target.value)}
        />
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm text-ink-soft">{t('fieldThemes')}</legend>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {DIRECTORY_THEMES.map((th) => (
            <label
              key={th}
              className="flex min-h-11 items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={themes.includes(th)}
                onChange={() =>
                  setThemes((prev) =>
                    prev.includes(th)
                      ? prev.filter((x) => x !== th)
                      : [...prev, th],
                  )
                }
              />
              {labels.themeLabels[th] ?? th}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="mt-2 flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={showMembers}
          onChange={(e) => setShowMembers(e.target.checked)}
        />
        {t('fieldShowMembers')}
      </label>

      <div className="mt-4">
        <p className="text-sm text-ink-soft">{t('fieldLogo')}</p>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          {currentLogo && !removeLogo ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed Convex storage URL, outside Next's image loader
            <img
              src={currentLogo}
              alt={t('logoAlt', { org: view.org.name })}
              className="h-16 w-16 rounded-sm border border-line bg-paper object-contain"
            />
          ) : null}
          <input
            type="file"
            accept={LOGO_ACCEPT}
            aria-label={t('fieldLogo')}
            disabled={uploading}
            onChange={(e) => void onLogo(e.target.files?.[0])}
            className="min-h-11 max-w-full text-sm"
          />
          {view.org.logoUrl ? (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={removeLogo}
                onChange={(e) => {
                  setRemoveLogo(e.target.checked);
                  if (e.target.checked) setLogo(null);
                }}
              />
              {t('logoRemove')}
            </label>
          ) : null}
        </div>
        {uploading ? (
          <p role="status" className="mt-2 text-xs text-muted">
            {t('logoUploading')}
          </p>
        ) : null}
      </div>

      <FormError className="mt-3">{error}</FormError>
      {done ? (
        <p role="status" className="mt-3 text-sm text-ink-soft">
          {t('revisionSubmitted')}
        </p>
      ) : null}
      <Button type="submit" className="mt-4" disabled={pending || uploading}>
        {t('submitRevision')}
      </Button>
    </form>
  );
}

function MembersSection({ view }: { view: OrgView }) {
  const t = useTranslations('orgAdmin');
  const errorText = useErrorText();
  const invite = useMutation(api.orgAdmin.inviteColleague);
  const remove = useMutation(api.orgAdmin.removeMember);
  const setRole = useMutation(api.orgAdmin.setMemberRole);
  const locale = useLocale();
  const owner = view.myRole === 'owner';
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<{
    userId: Id<'users'>;
    label: string;
    self: boolean;
  } | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  async function onInvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);
    await run(async () => {
      const res = await invite({
        orgId: view.org._id,
        email: email.trim(),
        // The inviter's screen language, for lack of anything better: the
        // colleague's is not known before their first sign-in.
        locale: resolveLocale(locale),
      });
      setEmail('');
      setStatus(
        res.emailMode === 'none' ? t('inviteNoEmail') : t('inviteDone'),
      );
    });
  }

  return (
    <section
      aria-labelledby="members-title"
      className="mt-8 rounded-md border border-line bg-surface p-5"
    >
      <h2 id="members-title" className="font-display text-xl">
        {t('membersTitle')}
      </h2>
      <ul className="mt-4 divide-y divide-line">
        {view.members.map((m) => {
          const label = m.name ?? m.email ?? '—';
          return (
            <li
              key={m.userId}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <span className="min-w-0 wrap-anywhere text-sm">
                {label}
                {m.email && m.name ? (
                  <span className="ms-2 font-mono text-xs text-muted">
                    {m.email}
                  </span>
                ) : null}
                {m.isSelf ? (
                  <span className="ms-1 text-xs text-muted">
                    {t('memberYou')}
                  </span>
                ) : null}
                <span className="ms-2 rounded-pill border border-line px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-soft">
                  {vocabulary(t, 'orgRole_', m.orgRole)}
                </span>
              </span>
              <span className="flex flex-wrap gap-2">
                {owner && !m.isSelf ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    aria-label={
                      m.orgRole === 'owner'
                        ? t('demoteFor', { name: label })
                        : t('promoteFor', { name: label })
                    }
                    onClick={() =>
                      void run(() =>
                        setRole({
                          orgId: view.org._id,
                          userId: m.userId,
                          orgRole: m.orgRole === 'owner' ? 'member' : 'owner',
                        }),
                      )
                    }
                  >
                    {m.orgRole === 'owner' ? t('demote') : t('promote')}
                  </Button>
                ) : null}
                {(owner && !m.isSelf) || m.isSelf ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    aria-label={
                      m.isSelf ? t('leave') : t('removeFor', { name: label })
                    }
                    onClick={() =>
                      setConfirm({ userId: m.userId, label, self: m.isSelf })
                    }
                  >
                    {m.isSelf ? t('leave') : t('remove')}
                  </Button>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>

      {owner ? (
        <form onSubmit={onInvite} noValidate className="mt-6">
          <h3 className="font-display text-lg">{t('inviteTitle')}</h3>
          <p className="mt-1 max-w-[65ch] text-sm text-ink-soft">
            {t('inviteHint')}
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <TextField
              label={t('inviteEmail')}
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              controlClassName="min-w-[16rem]"
            />
            <Button type="submit" disabled={pending || !email.trim()}>
              {t('inviteSubmit')}
            </Button>
          </div>
        </form>
      ) : null}
      {status ? (
        <p role="status" className="mt-3 text-sm text-ink-soft">
          {status}
        </p>
      ) : null}
      <FormError className="mt-3">{error}</FormError>

      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm?.self
            ? t('leaveConfirmTitle', { org: view.org.name })
            : t('removeConfirmTitle', { name: confirm?.label ?? '' })
        }
        description={
          confirm?.self ? t('leaveConfirmBody') : t('removeConfirmBody')
        }
        confirmLabel={t('confirm')}
        cancelLabel={t('cancel')}
        destructive
        pending={pending}
        onConfirm={() => {
          const target = confirm;
          if (!target) return;
          void run(() =>
            remove({ orgId: view.org._id, userId: target.userId }),
          ).then(() => setConfirm(null));
        }}
        onCancel={() => setConfirm(null)}
      />
    </section>
  );
}

function OrgPanel({
  orgId,
  labels,
}: {
  orgId: Id<'organizations'>;
  labels: Labels;
}) {
  const t = useTranslations('orgAdmin');
  const locale = useLocale();
  const view = useQuery(api.orgAdmin.organizationForMember, { orgId });
  if (view === undefined) {
    return <p className="mt-6 text-ink-soft">{t('loading')}</p>;
  }
  const decision = view.lastDecision;
  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl wrap-anywhere">{view.org.name}</h2>
        <span className="rounded-pill border border-line-strong px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-soft">
          {vocabulary(t, 'status_', view.org.status)}
        </span>
        <span className="text-sm text-ink-soft">
          {vocabulary(t, 'orgRole_', view.myRole)}
        </span>
      </div>
      {view.org.status === 'active' ? (
        <Link
          href={`/le-reseau/${view.org.slug}`}
          className="mt-2 inline-flex min-h-11 items-center text-sm text-accent-text hover:underline"
        >
          {t('viewPublic')}
        </Link>
      ) : null}

      {view.pendingRevision ? (
        <p className="mt-4 max-w-[65ch] rounded-md border border-accent-edge bg-accent-tint p-3 text-sm text-ink">
          {t('pendingNotice', {
            date: formatLongDate(view.pendingRevision.submittedAt, locale),
          })}
        </p>
      ) : decision ? (
        <p className="mt-4 max-w-[65ch] text-sm text-ink-soft wrap-anywhere">
          {decision.status === 'approved'
            ? t('lastApproved', {
                date: formatLongDate(decision.reviewedAt ?? 0, locale),
              })
            : t('lastRejected', {
                date: formatLongDate(decision.reviewedAt ?? 0, locale),
              })}
          {decision.status === 'rejected' && decision.reviewNotes
            ? ` ${t('rejectedNotes', { notes: decision.reviewNotes })}`
            : null}
        </p>
      ) : null}

      {view.myRole === 'owner' ? (
        <FicheForm
          key={view.pendingRevision?._id ?? view.org._id}
          view={view}
          labels={labels}
        />
      ) : null}
      <MembersSection view={view} />
    </div>
  );
}

function Manager(labels: Labels) {
  const t = useTranslations('orgAdmin');
  const tAccounts = useTranslations('accounts');
  const mine = useQuery(api.orgAdmin.myOrganizations);
  const [selected, setSelected] = useState<Id<'organizations'> | null>(null);
  const current = selected ?? mine?.[0]?.orgId ?? null;
  return (
    <div className="max-w-3xl">
      <MemberPageHeader
        title={t('title')}
        lead={tAccounts('organizationLead')}
      />
      {mine === undefined ? (
        <p className="mt-6 text-ink-soft">{t('loading')}</p>
      ) : mine.length === 0 ? (
        <div className="mt-6 rounded-md border border-dashed border-line-strong bg-surface p-6">
          <p className="text-ink">{t('none')}</p>
          <p className="mt-2 text-sm text-ink-soft">{t('noneHint')}</p>
        </div>
      ) : (
        <>
          {mine.length > 1 ? (
            <div
              role="group"
              aria-label={t('title')}
              className="mt-4 flex flex-wrap gap-2"
            >
              {mine.map((o) => (
                <Button
                  key={o.orgId}
                  size="sm"
                  variant={o.orgId === current ? 'default' : 'outline'}
                  aria-pressed={o.orgId === current}
                  onClick={() => setSelected(o.orgId)}
                >
                  {o.name}
                </Button>
              ))}
            </div>
          ) : null}
          {current ? (
            <OrgPanel key={current} orgId={current} labels={labels} />
          ) : null}
        </>
      )}
    </div>
  );
}

export function OrganizationManager(labels: Labels) {
  return (
    <AuthGate>
      <Manager {...labels} />
    </AuthGate>
  );
}
