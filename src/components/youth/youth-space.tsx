'use client';

import { useState, type FormEvent } from 'react';
import type { FunctionReturnType } from 'convex/server';
import { useMutation, useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { FIELD_MAX } from '@convex/lib/validation';
import {
  AVAILABILITIES,
  PROGRAMME_LANGUAGES,
  PROGRAMME_LIMITS,
  PROGRAMME_THEMES,
  YOUTH_PROGRAMMES,
  type Availability,
  type YouthProgramme,
} from '@convex/lib/programmes';
import type { SiteLocale } from '@convex/lib/locales';
import { Button } from '@/components/ui/button';
import {
  FormError,
  SelectField,
  TextField,
  TextareaField,
} from '@/components/ui/field';
import { vocabulary } from '@/i18n/vocabulary';
import {
  CARD,
  CheckGroup,
  StatusPill,
  statusTone,
  useDateFormat,
  useProgrammeError,
} from '@/components/programmes/shared';

// Youth space (F-58): persistent profile, linked applications, status.
export function YouthSpace() {
  const t = useTranslations('youth');
  const data = useQuery(api.youthProfiles.myYouthSpace);
  if (data === undefined)
    return <p className="mt-6 text-ink-soft">{t('loading')}</p>;
  if (data === null) return null;
  return (
    <div className="mt-8 space-y-10">
      {/* The form reads the profile ON MOUNT: it is only rendered once
          the query has arrived, so already pre-filled. */}
      <ProfileForm profile={data.profile} />
      {data.profile ? (
        <>
          <ApplyForm />
          <Applications applications={data.applications} />
        </>
      ) : (
        <p className="rounded-md border border-dashed border-line-strong bg-surface p-5 text-ink-soft">
          {t('profileFirst')}
        </p>
      )}
    </div>
  );
}

type Space = NonNullable<
  FunctionReturnType<typeof api.youthProfiles.myYouthSpace>
>;
type Profile = NonNullable<Space['profile']>;

function ProfileForm({ profile }: { profile: Profile | null }) {
  const t = useTranslations('youth');
  const tl = useTranslations('library');
  const save = useMutation(api.youthProfiles.saveYouthProfile);
  const errorMessage = useProgrammeError();
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [background, setBackground] = useState(profile?.background ?? '');
  const [country, setCountry] = useState(profile?.country ?? '');
  const [languages, setLanguages] = useState<string[]>(
    profile?.languages ?? [],
  );
  const [interests, setInterests] = useState<string[]>(
    profile?.interests ?? [],
  );
  const [availability, setAvailability] = useState<Availability>(
    profile?.availability ?? 'mensuelle',
  );
  const [consent, setConsent] = useState(profile?.consentProcessing ?? false);
  const [partner, setPartner] = useState(
    profile?.consentPartnerContact ?? false,
  );
  const [status, setStatus] = useState<'idle' | 'pending' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (displayName.trim().length < 2) return setError(t('errName'));
    if (country.trim().length < 2) return setError(t('errCountry'));
    if (languages.length === 0) return setError(t('errLanguages'));
    if (!consent) return setError(t('errConsent'));
    setStatus('pending');
    try {
      await save({
        displayName: displayName.trim(),
        background: background.trim(),
        country: country.trim(),
        languages: languages as SiteLocale[],
        interests,
        availability,
        consentProcessing: consent,
        consentPartnerContact: partner,
      });
      setStatus('saved');
    } catch (err) {
      setError(errorMessage(err));
      setStatus('idle');
    }
  }

  return (
    <section aria-labelledby="youth-profile-h">
      <h2 id="youth-profile-h" className="font-display text-2xl">
        {t('profileTitle')}
      </h2>
      <p className="mt-2 max-w-[60ch] text-[15px] text-ink-soft">
        {t('profileLead')}
      </p>
      <form
        onSubmit={onSubmit}
        noValidate
        className={`${CARD} mt-4 grid gap-4 sm:grid-cols-2`}
      >
        <TextField
          label={t('displayName')}
          id="yp-name"
          required
          maxLength={FIELD_MAX.name}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <TextField
          label={t('country')}
          id="yp-country"
          required
          maxLength={FIELD_MAX.country}
          value={country}
          onChange={(e) => setCountry(e.target.value)}
        />
        <TextareaField
          label={t('background')}
          id="yp-background"
          className="sm:col-span-2"
          rows={4}
          maxLength={PROGRAMME_LIMITS.background}
          hint={t('backgroundHint')}
          value={background}
          onChange={(e) => setBackground(e.target.value)}
        />
        <CheckGroup
          className="sm:col-span-2"
          legend={t('languages')}
          options={PROGRAMME_LANGUAGES.map((l) => ({
            value: l,
            label: vocabulary(tl, 'langs.', l),
          }))}
          value={languages}
          onChange={setLanguages}
        />
        <CheckGroup
          className="sm:col-span-2"
          legend={t('interests')}
          options={PROGRAMME_THEMES.map((s) => ({
            value: s,
            label: vocabulary(tl, 'themes.', s),
          }))}
          value={interests}
          onChange={setInterests}
        />
        <SelectField
          label={t('availability')}
          id="yp-availability"
          value={availability}
          onChange={(e) => setAvailability(e.target.value as Availability)}
        >
          {AVAILABILITIES.map((a) => (
            <option key={a} value={a}>
              {vocabulary(t, 'availability_', a)}
            </option>
          ))}
        </SelectField>
        <div className="space-y-2 sm:col-span-2">
          <label className="flex min-h-11 items-start gap-3 text-sm text-ink">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-accent"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>{t('consentProcessing')}</span>
          </label>
          <label className="flex min-h-11 items-start gap-3 text-sm text-ink">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-accent"
              checked={partner}
              onChange={(e) => setPartner(e.target.checked)}
            />
            <span>{t('consentPartner')}</span>
          </label>
        </div>
        <FormError className="sm:col-span-2">{error}</FormError>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={status === 'pending'}>
            {t('saveProfile')}
          </Button>
          {status === 'saved' ? (
            <p role="status" className="text-sm text-accent-text">
              {t('profileSaved')}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function ApplyForm() {
  const t = useTranslations('youth');
  const apply = useMutation(api.youthProfiles.applyToYouthProgramme);
  const errorMessage = useProgrammeError();
  const [programme, setProgramme] = useState<YouthProgramme>('hub');
  const [motivation, setMotivation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (motivation.trim().length < 10) return setError(t('errMotivation'));
    setPending(true);
    try {
      await apply({ programme, motivation: motivation.trim() });
      setMotivation('');
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="youth-apply-h">
      <h2 id="youth-apply-h" className="font-display text-2xl">
        {t('applyTitle')}
      </h2>
      <p className="mt-2 max-w-[60ch] text-[15px] text-ink-soft">
        {t('applyLead')}
      </p>
      <form
        onSubmit={onSubmit}
        noValidate
        className={`${CARD} mt-4 grid gap-4`}
      >
        <SelectField
          label={t('programme')}
          id="ya-programme"
          value={programme}
          onChange={(e) => setProgramme(e.target.value as YouthProgramme)}
        >
          {YOUTH_PROGRAMMES.map((p) => (
            <option key={p} value={p}>
              {vocabulary(t, 'programme_', p)}
            </option>
          ))}
        </SelectField>
        <TextareaField
          label={t('motivation')}
          id="ya-motivation"
          rows={4}
          required
          maxLength={FIELD_MAX.body}
          hint={
            <span className="wrap-anywhere">
              {t('charCount', {
                count: motivation.length,
                max: FIELD_MAX.body,
              })}
            </span>
          }
          value={motivation}
          onChange={(e) => setMotivation(e.target.value)}
        />
        <FormError>{error}</FormError>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {t('applySubmit')}
          </Button>
          {done ? (
            <p role="status" className="text-sm text-accent-text">
              {t('applyDone')}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function Applications({
  applications,
}: {
  applications: {
    _id: Id<'youthProgramApplications'>;
    programme: YouthProgramme;
    motivation: string;
    status: string;
    createdAt: number;
  }[];
}) {
  const t = useTranslations('youth');
  const fmt = useDateFormat();
  const withdraw = useMutation(api.youthProfiles.withdrawYouthApplication);
  const errorMessage = useProgrammeError();
  const [error, setError] = useState<string | null>(null);
  return (
    <section aria-labelledby="youth-apps-h">
      <h2 id="youth-apps-h" className="font-display text-2xl">
        {t('applicationsTitle')}
      </h2>
      {applications.length === 0 ? (
        <p className="mt-3 text-ink-soft">{t('applicationsEmpty')}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {applications.map((a) => (
            <li key={a._id} className={CARD}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium text-ink">
                  {vocabulary(t, 'programme_', a.programme)}
                </h3>
                <StatusPill tone={statusTone(a.status)}>
                  {vocabulary(t, 'status_', a.status)}
                </StatusPill>
                <span className="font-mono text-[11px] text-muted">
                  {fmt(a.createdAt)}
                </span>
              </div>
              <p className="mt-2 wrap-anywhere text-[14px] text-ink-soft">
                {a.motivation}
              </p>
              {a.status === 'pending' ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 min-h-11"
                  onClick={async () => {
                    setError(null);
                    try {
                      await withdraw({ applicationId: a._id });
                    } catch (err) {
                      setError(errorMessage(err));
                    }
                  }}
                >
                  {t('withdraw')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <FormError className="mt-3">{error}</FormError>
    </section>
  );
}
