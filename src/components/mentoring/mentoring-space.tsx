'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { FIELD_MAX } from '@convex/lib/validation';
import {
  AVAILABILITIES,
  PROGRAMME_LANGUAGES,
  PROGRAMME_LIMITS,
  PROGRAMME_REGIONS,
  PROGRAMME_THEMES,
  type Availability,
  type MentorRole,
} from '@convex/lib/programmes';
import type { SiteLocale } from '@convex/lib/locales';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import {
  FormError,
  SelectField,
  TextField,
  TextareaField,
} from '@/components/ui/field';
import { vocabulary } from '@/i18n/vocabulary';
import { isMember } from '@/lib/roles';
import {
  CARD,
  CheckGroup,
  StatusPill,
  statusTone,
  useDateFormat,
  useProgrammeError,
} from '@/components/programmes/shared';

type Space = NonNullable<FunctionReturnType<typeof api.mentoring.myMentoring>>;
type Profile = Space['profiles'][number];

const OFFSETS = Array.from({ length: 27 }, (_, i) => i - 12);

// Espace « mon mentorat » (F-59) : mes profils (mentoré, mentor), mes binômes.
export function MentoringSpace() {
  const t = useTranslations('mentorship');
  const data = useQuery(api.mentoring.myMentoring);
  const me = useQuery(api.users.current);
  if (data === undefined || me === undefined)
    return <p className="mt-6 text-ink-soft">{t('loading')}</p>;
  if (data === null) return null;
  const mentee = data.profiles.find((p) => p.role === 'mentore') ?? null;
  const mentor = data.profiles.find((p) => p.role === 'mentor') ?? null;
  return (
    <div className="mt-8 space-y-10">
      <section aria-labelledby="mentoring-pairs-h">
        <h2 id="mentoring-pairs-h" className="font-display text-2xl">
          {t('pairsTitle')}
        </h2>
        <Pairs pairs={data.pairs} />
      </section>
      <section aria-labelledby="mentoring-profiles-h">
        <h2 id="mentoring-profiles-h" className="font-display text-2xl">
          {t('profilesTitle')}
        </h2>
        <p className="mt-2 max-w-[60ch] text-[15px] text-ink-soft">
          {t('profilesLead')}
        </p>
        <div className="mt-4 space-y-4">
          <ProfileCard role="mentore" profile={mentee} />
          {isMember(me?.role) ? (
            <ProfileCard role="mentor" profile={mentor} />
          ) : (
            <p className={`${CARD} text-[14px] text-ink-soft`}>
              {t('mentorMembersOnly')}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function Pairs({ pairs }: { pairs: Space['pairs'] }) {
  const t = useTranslations('mentorship');
  const fmt = useDateFormat();
  const respond = useMutation(api.mentoring.respondToPair);
  const errorMessage = useProgrammeError();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (pairs.length === 0)
    return <p className="mt-3 text-ink-soft">{t('pairsEmpty')}</p>;
  return (
    <>
      <ul className="mt-4 space-y-3">
        {pairs.map((p) => (
          <li key={p._id} className={CARD}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="min-w-0 wrap-anywhere font-medium text-ink">
                {p.side === 'mentor'
                  ? t('pairWithMentee', { name: p.counterpartName })
                  : t('pairWithMentor', { name: p.counterpartName })}
              </h3>
              <StatusPill tone={statusTone(p.status)}>
                {vocabulary(t, 'pairStatus_', p.status)}
              </StatusPill>
              <span className="font-mono text-[11px] text-muted">
                {fmt(p.proposedAt)}
              </span>
            </div>
            {p.status === 'proposed' ? (
              <p className="mt-2 text-[14px] text-ink-soft">
                {p.myAcceptance
                  ? t('waitingOther')
                  : p.otherAcceptance
                    ? t('otherAccepted')
                    : t('proposedLead')}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {p.status === 'proposed' && !p.myAcceptance ? (
                <>
                  <Button
                    size="sm"
                    className="min-h-11"
                    disabled={busy === p._id}
                    onClick={async () => {
                      setBusy(p._id);
                      setError(null);
                      try {
                        await respond({ pairId: p._id, accept: true });
                      } catch (err) {
                        setError(errorMessage(err));
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    {t('accept')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-11"
                    disabled={busy === p._id}
                    onClick={async () => {
                      setBusy(p._id);
                      setError(null);
                      try {
                        await respond({ pairId: p._id, accept: false });
                      } catch (err) {
                        setError(errorMessage(err));
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    {t('decline')}
                  </Button>
                </>
              ) : null}
              <Link
                href={`/espace-membre/mentorat/${p._id}`}
                className="inline-flex min-h-11 items-center text-sm font-medium text-accent-text hover:underline"
              >
                {t('openPair')}
              </Link>
            </div>
          </li>
        ))}
      </ul>
      <FormError className="mt-3">{error}</FormError>
    </>
  );
}

function ProfileCard({
  role,
  profile,
}: {
  role: MentorRole;
  profile: Profile | null;
}) {
  const t = useTranslations('mentorship');
  const tl = useTranslations('library');
  const [editing, setEditing] = useState(false);
  const title = role === 'mentor' ? t('profileMentor') : t('profileMentee');
  if (editing)
    return (
      <ProfileForm
        role={role}
        profile={profile}
        title={title}
        onDone={() => setEditing(false)}
      />
    );
  const headingId = `mentor-profile-${role}`;
  return (
    <section className={CARD} aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={headingId} className="font-medium text-ink">
          {title}
        </h3>
        {profile ? (
          <StatusPill tone={profile.active ? 'good' : 'neutral'}>
            {profile.active ? t('profileActive') : t('profileInactive')}
          </StatusPill>
        ) : null}
      </div>
      {profile ? (
        <>
          <p className="mt-2 wrap-anywhere text-[14px] text-ink-soft">
            {profile.themes.map((s) => vocabulary(tl, 'themes.', s)).join(', ')}{' '}
            ·{' '}
            {profile.languages
              .map((l) => vocabulary(tl, 'langs.', l))
              .join(', ')}{' '}
            · {vocabulary(t, 'regions.', profile.region)}
          </p>
          <p className="mt-1 wrap-anywhere text-[14px] text-ink">
            {profile.goals}
          </p>
        </>
      ) : (
        <p className="mt-2 text-[14px] text-ink-soft">
          {role === 'mentor' ? t('noMentorProfile') : t('noMenteeProfile')}
        </p>
      )}
      <Button
        size="sm"
        variant="outline"
        className="mt-3 min-h-11"
        onClick={() => setEditing(true)}
      >
        {profile ? t('editProfile') : t('createProfile')}
      </Button>
    </section>
  );
}

function ProfileForm({
  role,
  profile,
  title,
  onDone,
}: {
  role: MentorRole;
  profile: Profile | null;
  title: string;
  onDone: () => void;
}) {
  const t = useTranslations('mentorship');
  const tl = useTranslations('library');
  const save = useMutation(api.mentoring.saveMentorProfile);
  const errorMessage = useProgrammeError();
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [themes, setThemes] = useState<string[]>(profile?.themes ?? []);
  const [languages, setLanguages] = useState<string[]>(
    profile?.languages ?? [],
  );
  const [region, setRegion] = useState(profile?.region ?? '');
  const [offset, setOffset] = useState(
    profile?.utcOffset === null || profile?.utcOffset === undefined
      ? ''
      : String(profile.utcOffset),
  );
  const [availability, setAvailability] = useState<Availability>(
    profile?.availability ?? 'mensuelle',
  );
  const [goals, setGoals] = useState(profile?.goals ?? '');
  const [capacity, setCapacity] = useState(String(profile?.capacity ?? 2));
  const [active, setActive] = useState(profile?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (displayName.trim().length < 2) return setError(t('errName'));
    if (themes.length === 0) return setError(t('errThemes'));
    if (languages.length === 0) return setError(t('errLanguages'));
    if (!region) return setError(t('errRegion'));
    if (goals.trim().length < 10) return setError(t('errGoals'));
    setPending(true);
    try {
      await save({
        role,
        displayName: displayName.trim(),
        themes,
        languages: languages as SiteLocale[],
        region,
        utcOffset: offset === '' ? undefined : Number(offset),
        availability,
        goals: goals.trim(),
        capacity: role === 'mentor' ? Number(capacity) : undefined,
        active,
      });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  const idp = `mp-${role}`;
  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className={`${CARD} grid gap-4 sm:grid-cols-2`}
      aria-label={title}
    >
      <h3 className="font-medium text-ink sm:col-span-2">{title}</h3>
      <TextField
        label={t('displayName')}
        id={`${idp}-name`}
        required
        maxLength={FIELD_MAX.name}
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />
      <SelectField
        label={t('region')}
        id={`${idp}-region`}
        required
        value={region}
        onChange={(e) => setRegion(e.target.value)}
      >
        <option value="" disabled>
          {t('regionPlaceholder')}
        </option>
        {PROGRAMME_REGIONS.map((r) => (
          <option key={r} value={r}>
            {vocabulary(t, 'regions.', r)}
          </option>
        ))}
      </SelectField>
      <CheckGroup
        className="sm:col-span-2"
        legend={t('themes')}
        options={PROGRAMME_THEMES.map((s) => ({
          value: s,
          label: vocabulary(tl, 'themes.', s),
        }))}
        value={themes}
        onChange={setThemes}
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
      <SelectField
        label={t('utcOffset')}
        id={`${idp}-offset`}
        value={offset}
        onChange={(e) => setOffset(e.target.value)}
      >
        <option value="">{t('utcOffsetNone')}</option>
        {OFFSETS.map((o) => (
          <option key={o} value={String(o)}>
            {t('utcOffsetValue', { offset: o >= 0 ? `+${o}` : String(o) })}
          </option>
        ))}
      </SelectField>
      <SelectField
        label={t('availability')}
        id={`${idp}-availability`}
        value={availability}
        onChange={(e) => setAvailability(e.target.value as Availability)}
      >
        {AVAILABILITIES.map((a) => (
          <option key={a} value={a}>
            {vocabulary(t, 'availability_', a)}
          </option>
        ))}
      </SelectField>
      {role === 'mentor' ? (
        <SelectField
          label={t('capacity')}
          id={`${idp}-capacity`}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
        >
          {Array.from(
            { length: PROGRAMME_LIMITS.maxMentorCapacity },
            (_, i) => i + 1,
          ).map((n) => (
            <option key={n} value={String(n)}>
              {n}
            </option>
          ))}
        </SelectField>
      ) : null}
      <TextareaField
        label={role === 'mentor' ? t('goalsMentor') : t('goalsMentee')}
        id={`${idp}-goals`}
        className="sm:col-span-2"
        rows={4}
        required
        maxLength={PROGRAMME_LIMITS.goals}
        value={goals}
        onChange={(e) => setGoals(e.target.value)}
      />
      <label className="flex min-h-11 items-center gap-3 text-sm text-ink sm:col-span-2">
        <input
          type="checkbox"
          className="h-4 w-4 accent-accent"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
        {t('activeLabel')}
      </label>
      <FormError className="sm:col-span-2">{error}</FormError>
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {t('saveProfile')}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}
