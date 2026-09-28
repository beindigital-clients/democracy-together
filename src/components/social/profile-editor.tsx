'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useConvex, useMutation, useQuery, useAction } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import {
  LINK_KINDS,
  NOTIFICATION_PREF_TYPES,
  PHOTO_MAX_BYTES,
  PHOTO_TYPES,
  PROFILE_BOUNDS,
  PROFILE_LANGUAGES,
  PROFILE_THEMES,
  type LinkKind,
  type MessagePolicy,
  type ProfileVisibility,
} from '@convex/lib/social';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { routing, type Locale } from '@/i18n/routing';
import { LOCALE_ENDONYMS } from '@/i18n/direction';
import { vocabulary } from '@/i18n/vocabulary';
import { languageName } from '@/lib/orgs';
import { Button } from '@/components/ui/button';
import {
  FormError,
  SelectField,
  TextField,
  TextareaField,
} from '@/components/ui/field';
import { uploadWithProgress, type UploadProgress } from '@/lib/upload';
import { cropToSquare } from '@/lib/image-crop';
import { PersonAvatar } from './person-avatar';

// "MON PROFIL" SCREEN (member area): identity, photo, privacy,
// preferences, blocked members, export of one's data.
//
// The server decides everything (limits, vocabularies, https links, available handle);
// the screen reads THE SAME limits via `@convex/lib/social` to display
// counters and `maxLength`, and attaches each server rejection to the field that
// caused it.

type Me = NonNullable<
  ReturnType<typeof useQuery<typeof api.social.profiles.getMine>>
>;

type FieldKey =
  'displayName' | 'handle' | 'jobTitle' | 'country' | 'bio' | 'links' | 'form';

// Server rejection -> faulty field. A code not listed here goes to the form.
const FIELD_OF: Record<string, FieldKey> = {
  INVALID_NAME: 'displayName',
  INVALID_HANDLE: 'handle',
  HANDLE_TAKEN: 'handle',
  INVALID_JOB: 'jobTitle',
  INVALID_COUNTRY: 'country',
  INVALID_BIO: 'bio',
  INVALID_LINK: 'links',
};

function errorCode(err: unknown): string {
  return err instanceof ConvexError && typeof err.data === 'string'
    ? err.data
    : 'generic';
}

const CHOICE =
  'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-sm px-2 text-sm text-ink hover:bg-surface-2';
const SECTION = 'rounded-md border border-line bg-surface p-5 sm:p-6';
const H2 = 'font-display text-xl text-ink';

export function ProfileEditor({
  themeLabels,
}: {
  themeLabels: Record<string, string>;
}) {
  const t = useTranslations('profile');
  const me = useQuery(api.social.profiles.getMine);
  if (me === undefined) {
    return (
      <p role="status" className="text-ink-soft">
        {t('loading')}
      </p>
    );
  }
  if (me === null) return null;
  return (
    <div className="space-y-8">
      {!me.isMember ? (
        <p className="rounded-md border border-accent-edge bg-accent-tint p-4 text-sm text-ink-soft">
          {t('notMemberNote')}
        </p>
      ) : null}
      {me.exists ? <PhotoSection me={me} /> : null}
      {/* The form is NOT remounted when the profile has just been created:
          the "Profil enregistré" confirmation would disappear with it.
          The identifier derived by the server is taken from `saveProfile`'s
          response. */}
      <ProfileForm me={me} themeLabels={themeLabels} />
      <LanguagePreference current={me.preferredLocale} />
      <BlockedList />
      <DataExport />
    </div>
  );
}

// --- Formulaire principal ------------------------------------------------------

function ProfileForm({
  me,
  themeLabels,
}: {
  me: Me;
  themeLabels: Record<string, string>;
}) {
  const t = useTranslations('profile');
  const locale = useLocale();
  const save = useMutation(api.social.profiles.saveProfile);

  const [displayName, setDisplayName] = useState(me.displayName);
  const [handle, setHandle] = useState(me.handle);
  const [jobTitle, setJobTitle] = useState(me.jobTitle);
  const [country, setCountry] = useState(me.country);
  const [bio, setBio] = useState(me.bio);
  const [themes, setThemes] = useState<string[]>(me.themes);
  const [languages, setLanguages] = useState<string[]>(me.languages);
  const [links, setLinks] = useState<{ kind: LinkKind; url: string }[]>(
    me.links,
  );
  const [visibility, setVisibility] = useState<ProfileVisibility>(
    me.visibility,
  );
  const [messagePolicy, setMessagePolicy] = useState<MessagePolicy>(
    me.messagePolicy,
  );
  const [muted, setMuted] = useState<string[]>(me.mutedNotificationTypes);
  const [messageEmail, setMessageEmail] = useState(me.messageEmail);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setSaved(false);
    setPending(true);
    try {
      const res = await save({
        displayName,
        handle,
        jobTitle,
        country,
        bio,
        themes,
        languages,
        links,
        visibility,
        messagePolicy,
        mutedNotificationTypes: muted,
        messageEmail,
      });
      setHandle(res.handle);
      setSaved(true);
    } catch (err) {
      const code = errorCode(err);
      const message = vocabulary(t, 'errors.', code, t('errors.generic'));
      setErrors({ [FIELD_OF[code] ?? 'form']: message });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-8">
      <section className={SECTION} aria-labelledby="profil-identite">
        <h2 id="profil-identite" className={H2}>
          {t('sectionIdentity')}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {t('counts', {
            followers: me.followerCount,
            following: me.followingCount,
          })}
        </p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <TextField
            label={t('displayName')}
            hint={t('displayNameHint', {
              min: PROFILE_BOUNDS.displayName.min,
              max: PROFILE_BOUNDS.displayName.max,
            })}
            error={errors.displayName}
            value={displayName}
            maxLength={PROFILE_BOUNDS.displayName.max}
            autoComplete="name"
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
          <TextField
            label={t('handle')}
            hint={t('handleHint')}
            error={errors.handle}
            value={handle}
            maxLength={PROFILE_BOUNDS.handle.max}
            autoCapitalize="none"
            spellCheck={false}
            dir="ltr"
            onChange={(e) => setHandle(e.target.value.toLowerCase())}
          />
          <TextField
            label={t('jobTitle')}
            error={errors.jobTitle}
            value={jobTitle}
            maxLength={PROFILE_BOUNDS.jobTitle.max}
            autoComplete="organization-title"
            onChange={(e) => setJobTitle(e.target.value)}
          />
          <TextField
            label={t('country')}
            hint={t('countryHint')}
            error={errors.country}
            value={country}
            maxLength={2}
            dir="ltr"
            autoCapitalize="characters"
            onChange={(e) => setCountry(e.target.value.toUpperCase())}
            controlClassName="max-w-[8rem]"
          />
        </div>
        <div className="mt-5">
          <p className="text-sm text-ink-soft">{t('organization')}</p>
          <p className="mt-1 wrap-anywhere text-sm text-ink">
            {me.organization ? (
              <Link
                href={`/le-reseau/${me.organization.slug}`}
                className="text-accent-text hover:underline"
              >
                {me.organization.name}
              </Link>
            ) : (
              t('organizationNone')
            )}
          </p>
          <p className="mt-1 text-xs text-muted">{t('organizationHint')}</p>
        </div>
        <TextareaField
          className="mt-5"
          label={t('bio')}
          hint={t('count', { count: bio.length, max: PROFILE_BOUNDS.bio.max })}
          error={errors.bio}
          value={bio}
          rows={5}
          maxLength={PROFILE_BOUNDS.bio.max}
          onChange={(e) => setBio(e.target.value)}
          controlClassName="wrap-anywhere"
        />
      </section>

      <section className={SECTION} aria-labelledby="profil-centres">
        <h2 id="profil-centres" className={H2}>
          {t('themes')}
        </h2>
        <fieldset className="mt-3">
          <legend className="sr-only">{t('themes')}</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {PROFILE_THEMES.map((slug) => (
              <label key={slug} className={CHOICE}>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--accent)]"
                  checked={themes.includes(slug)}
                  onChange={() => setThemes((l) => toggle(l, slug))}
                />
                {themeLabels[slug] ?? slug}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="mt-6">
          <legend className="font-display text-lg text-ink">
            {t('languages')}
          </legend>
          <div className="mt-2 flex flex-wrap gap-1">
            {PROFILE_LANGUAGES.map((code) => (
              <label key={code} className={CHOICE}>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--accent)]"
                  checked={languages.includes(code)}
                  onChange={() => setLanguages((l) => toggle(l, code))}
                />
                {languageName(code, locale)}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className={SECTION} aria-labelledby="profil-liens">
        <h2 id="profil-liens" className={H2}>
          {t('links')}
        </h2>
        <p className="mt-1 text-xs text-muted">
          {t('linksHint', { max: PROFILE_BOUNDS.links.max })}
        </p>
        <ul className="mt-4 space-y-3">
          {links.map((link, i) => (
            <li
              key={i}
              className="grid gap-3 sm:grid-cols-[12rem_1fr_auto] sm:items-end"
            >
              <SelectField
                label={t('linkKind')}
                value={link.kind}
                onChange={(e) =>
                  setLinks((ls) =>
                    ls.map((l, j) =>
                      j === i ? { ...l, kind: e.target.value as LinkKind } : l,
                    ),
                  )
                }
              >
                {LINK_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {vocabulary(t, 'linkKinds.', k)}
                  </option>
                ))}
              </SelectField>
              <TextField
                label={t('linkUrl')}
                type="url"
                inputMode="url"
                dir="ltr"
                placeholder="https://"
                value={link.url}
                maxLength={PROFILE_BOUNDS.linkUrl.max}
                onChange={(e) =>
                  setLinks((ls) =>
                    ls.map((l, j) =>
                      j === i ? { ...l, url: e.target.value } : l,
                    ),
                  )
                }
              />
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => setLinks((ls) => ls.filter((_, j) => j !== i))}
              >
                {t('linkRemove')}
              </Button>
            </li>
          ))}
        </ul>
        {errors.links ? (
          <FormError className="mt-2">{errors.links}</FormError>
        ) : null}
        {links.length < PROFILE_BOUNDS.links.max ? (
          <Button
            type="button"
            variant="outline"
            className="mt-4 min-h-11"
            onClick={() =>
              setLinks((ls) => [...ls, { kind: 'website', url: '' }])
            }
          >
            {t('linkAdd')}
          </Button>
        ) : null}
      </section>

      <section className={SECTION} aria-labelledby="profil-confidentialite">
        <h2 id="profil-confidentialite" className={H2}>
          {t('sectionPrivacy')}
        </h2>
        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-ink">
            {t('visibility')}
          </legend>
          <div className="mt-2 space-y-1">
            {(['private', 'members', 'public'] as const).map((v) => (
              <label key={v} className={CHOICE}>
                <input
                  type="radio"
                  name="visibility"
                  className="h-4 w-4 accent-[var(--accent)]"
                  checked={visibility === v}
                  onChange={() => setVisibility(v)}
                />
                {vocabulary(t, 'visibilityOptions.', v)}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="mt-6">
          <legend className="text-sm font-medium text-ink">
            {t('messagePolicy')}
          </legend>
          <div className="mt-2 space-y-1">
            {(['nobody', 'followed', 'members'] as const).map((v) => (
              <label key={v} className={CHOICE}>
                <input
                  type="radio"
                  name="messagePolicy"
                  className="h-4 w-4 accent-[var(--accent)]"
                  checked={messagePolicy === v}
                  onChange={() => setMessagePolicy(v)}
                />
                {vocabulary(t, 'messagePolicyOptions.', v)}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">{t('messagePolicyHint')}</p>
        </fieldset>
      </section>

      <section className={SECTION} aria-labelledby="profil-notifications">
        <h2 id="profil-notifications" className={H2}>
          {t('notifications')}
        </h2>
        <fieldset className="mt-3">
          <legend className="text-xs text-muted">
            {t('notificationsHint')}
          </legend>
          <div className="mt-2 grid gap-1 sm:grid-cols-2">
            {NOTIFICATION_PREF_TYPES.map((type) => (
              <label key={type} className={CHOICE}>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--accent)]"
                  checked={!muted.includes(type)}
                  onChange={() => setMuted((l) => toggle(l, type))}
                />
                {vocabulary(t, 'notifTypes.', type)}
              </label>
            ))}
          </div>
        </fieldset>
        <label className={`${CHOICE} mt-4`}>
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--accent)]"
            checked={messageEmail && me.emailAvailable}
            disabled={!me.emailAvailable}
            onChange={() => setMessageEmail((v) => !v)}
          />
          {t('messageEmail')}
        </label>
        {!me.emailAvailable ? (
          <p className="mt-1 text-xs text-muted">
            {t('messageEmailUnavailable')}
          </p>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" className="min-h-11" disabled={pending}>
          {pending ? t('saving') : me.exists ? t('save') : t('create')}
        </Button>
        {me.exists && me.isMember && me.visibility !== 'private' ? (
          <Link
            href={`/membres/${me.handle}`}
            className="inline-flex min-h-11 items-center text-sm font-medium text-accent-text hover:underline"
          >
            {t('viewPublic')}
          </Link>
        ) : null}
        <p role="status" className="text-sm text-bar-1">
          {saved ? t('saved') : null}
        </p>
      </div>
      <FormError>{errors.form}</FormError>
    </form>
  );
}

// --- Photo -------------------------------------------------------------------

function PhotoSection({ me }: { me: Me }) {
  const t = useTranslations('profile');
  const generateUploadUrl = useMutation(
    api.social.profiles.generatePhotoUploadUrl,
  );
  const setPhoto = useAction(api.social.profiles.setPhoto);
  const removePhoto = useMutation(api.social.profiles.removePhoto);
  const input = useRef<HTMLInputElement>(null);
  const [crop, setCrop] = useState(true);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [message, setMessage] = useState<{
    kind: 'ok' | 'error';
    text: string;
  } | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    // First browser-side filter, so as not to send 20 MB for nothing.
    // The server re-checks everything, actual content included.
    if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) {
      setMessage({ kind: 'error', text: t('photoInvalid') });
      return;
    }
    let blob: Blob = file;
    let contentType = file.type;
    if (crop) {
      const cropped = await cropToSquare(file);
      if (cropped) {
        blob = cropped;
        contentType = 'image/jpeg';
      }
    }
    if (blob.size === 0 || blob.size > PHOTO_MAX_BYTES) {
      setMessage({ kind: 'error', text: t('photoInvalid') });
      return;
    }
    try {
      setProgress({ loaded: 0, total: blob.size, percent: 0 });
      const url = await generateUploadUrl();
      const { storageId } = await uploadWithProgress<{ storageId: string }>({
        url,
        file: blob,
        contentType,
        onProgress: setProgress,
      });
      await setPhoto({ storageId: storageId as Id<'_storage'> });
      setMessage({ kind: 'ok', text: t('photoSaved') });
    } catch (err) {
      const code = errorCode(err);
      setMessage({
        kind: 'error',
        text: code === 'INVALID_PHOTO' ? t('photoInvalid') : t('photoFailed'),
      });
    } finally {
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <section className={SECTION} aria-labelledby="profil-photo">
      <h2 id="profil-photo" className={H2}>
        {t('sectionPhoto')}
      </h2>
      <div className="mt-4 flex flex-wrap items-center gap-5">
        <PersonAvatar
          name={me.displayName}
          photoUrl={me.photoUrl}
          size={96}
          alt={t('photoAlt', { name: me.displayName })}
        />
        <div className="space-y-2">
          <input
            ref={input}
            type="file"
            accept={PHOTO_TYPES.join(',')}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="min-h-11"
              disabled={progress !== null}
              onClick={() => input.current?.click()}
            >
              {t('photoChoose')}
            </Button>
            {me.photoUrl ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={progress !== null}
                onClick={async () => {
                  await removePhoto({});
                  setMessage({ kind: 'ok', text: t('photoRemoved') });
                }}
              >
                {t('photoRemove')}
              </Button>
            ) : null}
          </div>
          <label className={CHOICE}>
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent)]"
              checked={crop}
              onChange={() => setCrop((c) => !c)}
            />
            {t('photoCrop')}
          </label>
          <p className="text-xs text-muted">{t('photoHint')}</p>
        </div>
      </div>
      <p
        role="status"
        className={`mt-3 text-sm ${message?.kind === 'error' ? 'text-bar-5' : 'text-bar-1'}`}
      >
        {progress
          ? progress.percent !== null
            ? t('photoUploading', { percent: progress.percent })
            : t('photoUploadingIndeterminate')
          : (message?.text ?? null)}
      </p>
    </section>
  );
}

// --- Interface language ---------------------------------------------------------

// Reuses `users.preferredLocale` (already read by the emails and the
// language picker): a single setting, not a second one that would diverge.
function LanguagePreference({ current }: { current: string | null }) {
  const t = useTranslations('profile');
  const active = useLocale() as Locale;
  const setPreferred = useMutation(api.users.setPreferredLocale);
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState<string>(current ?? active);
  const [saved, setSaved] = useState(false);

  return (
    <section className={SECTION} aria-labelledby="profil-langue">
      <h2 id="profil-langue" className={H2}>
        {t('sectionPreferences')}
      </h2>
      <SelectField
        className="mt-4 max-w-xs"
        label={t('language')}
        hint={t('languageHint')}
        value={value}
        onChange={async (e) => {
          const next = e.target.value as Locale;
          setValue(next);
          setSaved(false);
          await setPreferred({ locale: next });
          setSaved(true);
          if (next !== active) router.replace(pathname, { locale: next });
        }}
      >
        {routing.locales.map((l) => (
          <option key={l} value={l} lang={l}>
            {LOCALE_ENDONYMS[l]}
          </option>
        ))}
      </SelectField>
      <p role="status" className="mt-2 text-sm text-bar-1">
        {saved ? t('languageSaved') : null}
      </p>
    </section>
  );
}

// --- Blocked members ---------------------------------------------------------------

function BlockedList() {
  const t = useTranslations('profile');
  const blocks = useQuery(api.social.messages.myBlocks);
  const unblock = useMutation(api.social.messages.unblock);
  return (
    <section className={SECTION} aria-labelledby="profil-bloques">
      <h2 id="profil-bloques" className={H2}>
        {t('sectionBlocked')}
      </h2>
      <p className="mt-1 text-xs text-muted">{t('blockedHint')}</p>
      {blocks === undefined ? null : blocks.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">{t('blockedEmpty')}</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {blocks.map((b) => (
            <li
              key={b.userId}
              className="flex items-center justify-between gap-3 py-2"
            >
              <span className="wrap-anywhere text-sm text-ink">
                {b.displayName || t('unknownMember')}
              </span>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => unblock({ userId: b.userId })}
              >
                {t('unblock')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// --- Export RGPD -----------------------------------------------------------------

function DataExport() {
  const t = useTranslations('profile');
  const convex = useConvex();
  const [pending, setPending] = useState(false);
  async function download() {
    setPending(true);
    try {
      const data = await convex.query(api.social.profiles.exportMine, {});
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'democracy-together-social.json';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setPending(false);
    }
  }
  return (
    <section className={SECTION} aria-labelledby="profil-donnees">
      <h2 id="profil-donnees" className={H2}>
        {t('sectionData')}
      </h2>
      <p className="mt-1 text-sm text-ink-soft">{t('exportHint')}</p>
      <Button
        type="button"
        variant="outline"
        className="mt-4 min-h-11"
        disabled={pending}
        onClick={download}
      >
        {t('exportCta')}
      </Button>
    </section>
  );
}
