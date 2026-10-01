'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useAction, useConvex, useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import {
  AtSign,
  Bell,
  Camera,
  Download,
  Eye,
  Globe,
  Languages,
  Link2,
  Lock,
  Plus,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserRound,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
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
import { LOCALE_ENDONYMS, directionOf } from '@/i18n/direction';
import { vocabulary } from '@/i18n/vocabulary';
import { countryFlag, countryName, languageName } from '@/lib/orgs';
import { countryOptions } from '@/lib/countries';
import { profileCompletion } from '@/lib/profile-completion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Field,
  FormError,
  TextField,
  TextareaField,
} from '@/components/ui/field';
import { ComboboxField, SelectField } from '@/components/ui/choice-fields';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Skeleton } from '@/components/ui/skeleton';
import { uploadWithProgress, type UploadProgress } from '@/lib/upload';
import { cropToSquare } from '@/lib/image-crop';
import { PersonAvatar } from './person-avatar';
import { ChipGroup, ChoiceCards, SwitchRow } from './profile-controls';
import {
  draftFrom,
  sameDraft,
  toggleIn,
  type ProfileDraft,
} from './profile-draft';
import { Checkbox } from '@/components/ui/checkbox';

// "MON PROFIL" SCREEN (member area): identity, photo, interests, links,
// privacy, notifications — then language, blocked members, data export.
//
// The server decides everything (limits, vocabularies, https links, available
// handle); the screen reads THE SAME limits via `@convex/lib/social` to show
// counters and `maxLength`, and attaches each server rejection to the field
// that caused it.
//
// What the redesign changes, and why:
//  - a LIVE PREVIEW of the directory card beside the form, with the profile
//    meter: one sees what others will see while typing it;
//  - themes and languages as pills, visibility as three described cards: a
//    choice read at a glance instead of a column of checkboxes;
//  - the country chosen by NAME from a list, not typed as a two-letter code;
//  - one save bar that stays in view and says whether something is left to
//    save — the old button sat under six sections.

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

// Control that receives focus when the server refuses its field.
const FOCUS_ID: Partial<Record<FieldKey, string>> = {
  displayName: 'profil-nom',
  handle: 'profil-handle',
  jobTitle: 'profil-fonction',
  country: 'profil-pays',
  bio: 'profil-bio',
  links: 'profil-lien-0',
};

// Language names come lowercase from CLDR in French ("anglais"): right in
// running text, odd on a pill that stands alone.
function capitalized(label: string, locale: string): string {
  return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
}

function errorCode(err: unknown): string {
  return err instanceof ConvexError && typeof err.data === 'string'
    ? err.data
    : 'generic';
}

// Section headings are anchor targets (dashboard checklist, "on this page"):
// `scroll-mt` keeps them clear of the sticky site header.
// `@container`: the fields lay out by the width of the SECTION, not of the
// window — the form column is narrower than the screen once the preview
// sits beside it.
const SECTION =
  '@container rounded-md border border-line bg-surface p-5 shadow-card sm:p-6';

function SectionTitle({
  id,
  icon: Icon,
  children,
  lead,
}: {
  id: string;
  icon: LucideIcon;
  children: ReactNode;
  lead?: ReactNode;
}) {
  return (
    <div className="mb-5">
      <h2
        id={id}
        className="flex scroll-mt-24 items-center gap-2.5 font-display text-[21px] leading-tight text-ink"
      >
        <span
          aria-hidden="true"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-accent-tint text-accent-text"
        >
          <Icon className="h-4 w-4" />
        </span>
        {children}
      </h2>
      {lead ? (
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{lead}</p>
      ) : null}
    </div>
  );
}

export function ProfileEditor({
  themeLabels,
}: {
  themeLabels: Record<string, string>;
}) {
  const me = useQuery(api.social.profiles.getMine);
  if (me === undefined) {
    return (
      <div aria-busy="true" className="space-y-6">
        <Skeleton className="h-40 w-full rounded-md" />
        <Skeleton className="h-72 w-full rounded-md" />
      </div>
    );
  }
  if (me === null) return null;
  return <ProfileWorkspace me={me} themeLabels={themeLabels} />;
}

// --- Workspace: form + live preview ---------------------------------------------

function ProfileWorkspace({
  me,
  themeLabels,
}: {
  me: Me;
  themeLabels: Record<string, string>;
}) {
  const t = useTranslations('profile');
  // The form is NOT remounted when the profile has just been created: the
  // "Profil enregistré" confirmation would disappear with it. The handle the
  // server derived is taken from `saveProfile`'s response.
  const [draft, setDraft] = useState<ProfileDraft>(() => draftFrom(me));
  const [baseline, setBaseline] = useState<ProfileDraft>(() => draftFrom(me));
  const [exists, setExists] = useState(me.exists);
  const dirty = !sameDraft(draft, baseline);

  // Arriving from the dashboard checklist (`/espace-membre/profil#profil-
  // photo`): the router's own scroll to the anchor happens before this data
  // loads, when the section does not exist yet. This workspace only mounts
  // once it does, so the jump is made here.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }, []);

  const completion = profileCompletion({
    ...draft,
    exists: true,
    photoUrl: me.photoUrl,
  });

  return (
    <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_17rem] xl:items-start">
      <div className="min-w-0 space-y-6">
        {!me.isMember ? (
          <p className="rounded-md border border-accent-edge bg-accent-tint p-4 text-sm leading-relaxed text-ink-soft">
            {t('notMemberNote')}
          </p>
        ) : null}
        <PhotoSection me={me} exists={exists} />
        <ProfileForm
          me={me}
          themeLabels={themeLabels}
          draft={draft}
          setDraft={setDraft}
          baseline={baseline}
          dirty={dirty}
          exists={exists}
          onSaved={(saved) => {
            setBaseline(saved);
            setDraft(saved);
            setExists(true);
          }}
        />
        <LanguagePreference current={me.preferredLocale} />
        <BlockedList />
        <DataExport />
      </div>

      <aside className="min-w-0 space-y-5 xl:sticky xl:top-24">
        <ProfilePreview
          draft={draft}
          photoUrl={me.photoUrl}
          organization={me.organization}
          themeLabels={themeLabels}
        />
        <div className="rounded-md border border-line bg-surface p-4">
          <ProgressBar
            label={t('completionLabel')}
            percent={completion.percent}
            text={`${completion.percent} %`}
          />
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {completion.complete ? t('completionFull') : t('completionHint')}
          </p>
        </div>
        {exists && me.isMember && baseline.visibility !== 'private' ? (
          <Button asChild variant="outline" className="min-h-11 w-full">
            <Link href={`/membres/${baseline.handle}`}>
              <Eye aria-hidden="true" />
              {t('viewPublic')}
            </Link>
          </Button>
        ) : null}
        <OnThisPage />
      </aside>
    </div>
  );
}

// --- Preview of the directory card ------------------------------------------------

function ProfilePreview({
  draft,
  photoUrl,
  organization,
  themeLabels,
}: {
  draft: ProfileDraft;
  photoUrl: string | null;
  organization: { name: string; slug: string } | null;
  themeLabels: Record<string, string>;
}) {
  const t = useTranslations('profile');
  const locale = useLocale();
  const name = draft.displayName.trim() || t('previewNoName');
  const country = draft.country ? countryName(draft.country, locale) : null;
  const VIS: Record<ProfileVisibility, LucideIcon> = {
    private: Lock,
    members: UsersRound,
    public: Globe,
  };
  const VisIcon = VIS[draft.visibility];
  return (
    <section
      aria-labelledby="profil-apercu"
      className="overflow-hidden rounded-md border border-line bg-surface shadow-card"
    >
      <div
        aria-hidden="true"
        className="h-16 bg-[linear-gradient(135deg,var(--accent),color-mix(in_srgb,var(--accent)_45%,var(--surface)))]"
      />
      <div className="px-4 pb-4">
        <div className="-mt-9 flex items-end justify-between gap-2">
          {photoUrl || draft.displayName.trim() ? (
            <PersonAvatar
              name={name}
              photoUrl={photoUrl}
              size={72}
              className="border-[3px] border-surface bg-surface-2"
            />
          ) : (
            // No name typed yet: a silhouette, rather than the initials of
            // the "Votre nom" placeholder.
            <span
              aria-hidden="true"
              className="grid h-[72px] w-[72px] place-items-center rounded-full border-[3px] border-surface bg-surface-2 text-muted"
            >
              <UserRound className="h-8 w-8" />
            </span>
          )}
          <span className="mb-1 inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink-soft">
            <VisIcon aria-hidden="true" className="h-3.5 w-3.5" />
            {vocabulary(t, 'visibilityTitles.', draft.visibility)}
          </span>
        </div>
        <h2
          id="profil-apercu"
          className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-muted"
        >
          {t('previewTitle')}
        </h2>
        <p className="mt-1 wrap-anywhere font-display text-xl leading-tight text-ink">
          {name}
        </p>
        {draft.jobTitle.trim() ? (
          <p className="mt-1 wrap-anywhere text-sm text-ink-soft">
            {draft.jobTitle.trim()}
          </p>
        ) : null}
        {organization || country ? (
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {organization ? (
              <span className="wrap-anywhere">{organization.name}</span>
            ) : null}
            {organization && country ? ' · ' : null}
            {country ? (
              <span>
                <span aria-hidden="true">{countryFlag(draft.country)}</span>{' '}
                {country}
              </span>
            ) : null}
          </p>
        ) : null}
        {draft.themes.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-1">
            {draft.themes.map((slug) => (
              <li
                key={slug}
                className="rounded-pill border border-line-strong px-2 py-0.5 text-[11px] text-ink-soft"
              >
                {themeLabels[slug] ?? slug}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-muted">
          {t('previewHint')}
        </p>
      </div>
    </section>
  );
}

function OnThisPage() {
  const t = useTranslations('profile');
  const items: [string, string][] = [
    ['profil-photo', t('sectionPhoto')],
    ['profil-identite', t('sectionIdentity')],
    ['profil-centres', t('sectionInterests')],
    ['profil-liens', t('links')],
    ['profil-confidentialite', t('sectionPrivacy')],
    ['profil-notifications', t('notifications')],
    ['profil-langue', t('sectionPreferences')],
    ['profil-bloques', t('sectionBlocked')],
    ['profil-donnees', t('sectionData')],
  ];
  return (
    <nav aria-label={t('onThisPage')} className="hidden xl:block">
      <p className="px-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
        {t('onThisPage')}
      </p>
      <ul className="mt-2">
        {items.map(([id, label]) => (
          <li key={id}>
            <a
              href={`#${id}`}
              className="block rounded-sm px-2 py-1.5 text-sm text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// --- Main form ---------------------------------------------------------------------

function ProfileForm({
  me,
  themeLabels,
  draft,
  setDraft,
  baseline,
  dirty,
  exists,
  onSaved,
}: {
  me: Me;
  themeLabels: Record<string, string>;
  draft: ProfileDraft;
  setDraft: (update: (d: ProfileDraft) => ProfileDraft) => void;
  baseline: ProfileDraft;
  dirty: boolean;
  exists: boolean;
  onSaved: (saved: ProfileDraft) => void;
}) {
  const t = useTranslations('profile');
  const locale = useLocale();
  const save = useMutation(api.social.profiles.saveProfile);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const dir = directionOf(locale);
  const countries = useMemo(
    () =>
      countryOptions(locale, draft.country).map((c) => ({
        value: c.code,
        label: c.name,
      })),
    [locale, draft.country],
  );

  const set = <K extends keyof ProfileDraft>(
    key: K,
    value: ProfileDraft[K],
  ) => {
    setSaved(false);
    setDraft((d) => ({ ...d, [key]: value }));
  };

  // Leaving the page with unsaved changes: the browser asks first. Only
  // while something is actually left to save.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setSaved(false);
    setPending(true);
    try {
      const res = await save({
        displayName: draft.displayName,
        handle: draft.handle,
        jobTitle: draft.jobTitle,
        country: draft.country,
        bio: draft.bio,
        themes: draft.themes,
        languages: draft.languages,
        links: draft.links,
        visibility: draft.visibility,
        messagePolicy: draft.messagePolicy,
        mutedNotificationTypes: draft.mutedNotificationTypes,
        messageEmail: draft.messageEmail,
      });
      onSaved({
        ...draft,
        handle: res.handle,
        displayName: draft.displayName.trim().replace(/\s+/g, ' '),
        links: draft.links
          .map((l) => ({ kind: l.kind, url: l.url.trim() }))
          .filter((l) => l.url !== ''),
      });
      setSaved(true);
    } catch (err) {
      const code = errorCode(err);
      const message = vocabulary(t, 'errors.', code, t('errors.generic'));
      const field = FIELD_OF[code] ?? 'form';
      setErrors({ [field]: message });
      // Focus goes to the refused field, whose error is tied to it: the
      // person lands where the correction is to be made.
      const target = FOCUS_ID[field];
      if (target) {
        requestAnimationFrame(() => document.getElementById(target)?.focus());
      }
    } finally {
      setPending(false);
    }
  }

  const visibilityOptions: {
    value: ProfileVisibility;
    title: string;
    description: string;
    icon: LucideIcon;
  }[] = [
    {
      value: 'private',
      title: t('visibilityTitles.private'),
      description: t('visibilityDescriptions.private'),
      icon: Lock,
    },
    {
      value: 'members',
      title: t('visibilityTitles.members'),
      description: t('visibilityDescriptions.members'),
      icon: UsersRound,
    },
    {
      value: 'public',
      title: t('visibilityTitles.public'),
      description: t('visibilityDescriptions.public'),
      icon: Globe,
    },
  ];
  const policyOptions: { value: MessagePolicy; title: string }[] = (
    ['nobody', 'followed', 'members'] as const
  ).map((v) => ({
    value: v,
    title: vocabulary(t, 'messagePolicyOptions.', v),
  }));

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      // Keyboard focus scrolled into view must not end up under the save
      // bar that stays at the bottom of the screen (WCAG 2.4.11).
      className="space-y-6 [&_input]:scroll-mb-28 [&_select]:scroll-mb-28 [&_textarea]:scroll-mb-28"
    >
      <section className={SECTION} aria-labelledby="profil-identite">
        <SectionTitle
          id="profil-identite"
          icon={UserRound}
          lead={t('counts', {
            followers: me.followerCount,
            following: me.followingCount,
          })}
        >
          {t('sectionIdentity')}
        </SectionTitle>
        <div className="grid gap-5 @md:grid-cols-2">
          <TextField
            id="profil-nom"
            label={t('displayName')}
            hint={t('displayNameHint', {
              min: PROFILE_BOUNDS.displayName.min,
              max: PROFILE_BOUNDS.displayName.max,
            })}
            error={errors.displayName}
            value={draft.displayName}
            maxLength={PROFILE_BOUNDS.displayName.max}
            autoComplete="name"
            onChange={(e) => set('displayName', e.target.value)}
            required
          />
          <TextField
            id="profil-fonction"
            label={t('jobTitle')}
            hint={t('jobTitleHint')}
            error={errors.jobTitle}
            value={draft.jobTitle}
            maxLength={PROFILE_BOUNDS.jobTitle.max}
            autoComplete="organization-title"
            onChange={(e) => set('jobTitle', e.target.value)}
          />
          <Field
            id="profil-handle"
            label={t('handle')}
            hint={t('handleHint')}
            error={errors.handle}
          >
            {(control) => (
              <div
                dir="ltr"
                className={cn(
                  'flex items-stretch overflow-hidden rounded-sm border bg-surface transition-colors focus-within:border-accent-text',
                  errors.handle ? 'border-bar-5' : 'border-line-field',
                )}
              >
                <span
                  aria-hidden="true"
                  className="flex items-center gap-1 border-e border-line bg-surface-2 px-2.5 font-mono text-xs text-muted"
                >
                  <AtSign className="h-3.5 w-3.5" />
                  /membres/
                </span>
                <input
                  {...control}
                  value={draft.handle}
                  maxLength={PROFILE_BOUNDS.handle.max}
                  autoCapitalize="none"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => set('handle', e.target.value.toLowerCase())}
                  className="min-w-0 flex-1 bg-transparent px-3 py-2.5 font-mono text-sm text-ink placeholder:text-muted"
                />
              </div>
            )}
          </Field>
          {/* A list of ~250 countries: searchable, by name (accents
              ignored) or by code. */}
          <ComboboxField
            id="profil-pays"
            label={t('country')}
            error={errors.country}
            value={draft.country}
            onValueChange={(v) => set('country', v)}
            options={countries}
            placeholder={t('countryNone')}
            emptyLabel={t('countryNone')}
            searchLabel={t('countrySearchLabel')}
            searchPlaceholder={t('countrySearchPlaceholder')}
            noResults={t('countryNoResults')}
          />
        </div>
        <div className="mt-5 rounded-sm border border-line bg-paper/40 px-3.5 py-3">
          <p className="text-sm text-ink-soft">{t('organization')}</p>
          <p className="mt-0.5 wrap-anywhere text-sm font-medium text-ink">
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
          id="profil-bio"
          className="mt-5"
          label={t('bio')}
          hint={`${t('bioHint')} ${t('count', {
            count: draft.bio.length,
            max: PROFILE_BOUNDS.bio.max,
          })}`}
          error={errors.bio}
          value={draft.bio}
          rows={6}
          maxLength={PROFILE_BOUNDS.bio.max}
          onChange={(e) => set('bio', e.target.value)}
          controlClassName="wrap-anywhere leading-relaxed"
        />
      </section>

      <section className={SECTION} aria-labelledby="profil-centres">
        <SectionTitle id="profil-centres" icon={Languages}>
          {t('sectionInterests')}
        </SectionTitle>
        <div className="space-y-6">
          <ChipGroup
            legend={t('themes')}
            hint={t('themesHint')}
            options={PROFILE_THEMES.map((slug) => ({
              value: slug,
              label: themeLabels[slug] ?? slug,
            }))}
            value={draft.themes}
            onToggle={(v) => set('themes', toggleIn(draft.themes, v))}
          />
          <ChipGroup
            legend={t('languages')}
            options={PROFILE_LANGUAGES.map((code) => ({
              value: code,
              label: capitalized(languageName(code, locale), locale),
            }))}
            value={draft.languages}
            onToggle={(v) => set('languages', toggleIn(draft.languages, v))}
          />
        </div>
      </section>

      <section className={SECTION} aria-labelledby="profil-liens">
        <SectionTitle
          id="profil-liens"
          icon={Link2}
          lead={t('linksHint', { max: PROFILE_BOUNDS.links.max })}
        >
          {t('links')}
        </SectionTitle>
        {draft.links.length === 0 ? (
          <p className="text-sm text-muted">{t('linksEmpty')}</p>
        ) : (
          <ul className="space-y-3">
            {draft.links.map((link, i) => (
              <li
                key={i}
                className="grid gap-3 rounded-sm border border-line bg-paper/40 p-3 @lg:grid-cols-[10rem_minmax(0,1fr)_auto] @lg:items-end"
              >
                <SelectField
                  label={t('linkKind')}
                  value={link.kind}
                  dir={dir}
                  onValueChange={(v) =>
                    set(
                      'links',
                      draft.links.map((l, j) =>
                        j === i ? { ...l, kind: v as LinkKind } : l,
                      ),
                    )
                  }
                  options={LINK_KINDS.map((k) => ({
                    value: k,
                    label: vocabulary(t, 'linkKinds.', k),
                  }))}
                />
                <TextField
                  id={`profil-lien-${i}`}
                  label={t('linkUrl')}
                  type="url"
                  inputMode="url"
                  dir="ltr"
                  placeholder="https://"
                  value={link.url}
                  maxLength={PROFILE_BOUNDS.linkUrl.max}
                  onChange={(e) =>
                    set(
                      'links',
                      draft.links.map((l, j) =>
                        j === i ? { ...l, url: e.target.value } : l,
                      ),
                    )
                  }
                />
                {/* Icon-only from `@lg` up, where the row is one line: the
                    label stays in the button for screen readers. */}
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 @lg:w-11 @lg:px-0"
                  onClick={() =>
                    set(
                      'links',
                      draft.links.filter((_, j) => j !== i),
                    )
                  }
                >
                  <Trash2 aria-hidden="true" />
                  <span className="@lg:sr-only">{t('linkRemove')}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
        {errors.links ? (
          <FormError className="mt-2">{errors.links}</FormError>
        ) : null}
        {draft.links.length < PROFILE_BOUNDS.links.max ? (
          <Button
            type="button"
            variant="outline"
            className="mt-4 min-h-11"
            onClick={() =>
              set('links', [...draft.links, { kind: 'website', url: '' }])
            }
          >
            <Plus aria-hidden="true" />
            {t('linkAdd')}
          </Button>
        ) : null}
      </section>

      <section className={SECTION} aria-labelledby="profil-confidentialite">
        <SectionTitle id="profil-confidentialite" icon={ShieldCheck}>
          {t('sectionPrivacy')}
        </SectionTitle>
        <div className="space-y-7">
          <ChoiceCards
            legend={t('visibility')}
            name="visibility"
            options={visibilityOptions}
            value={draft.visibility}
            onChange={(v) => set('visibility', v)}
          />
          <ChoiceCards
            legend={t('messagePolicy')}
            hint={t('messagePolicyHint')}
            name="messagePolicy"
            options={policyOptions}
            value={draft.messagePolicy}
            onChange={(v) => set('messagePolicy', v)}
          />
        </div>
      </section>

      <section className={SECTION} aria-labelledby="profil-notifications">
        <SectionTitle
          id="profil-notifications"
          icon={Bell}
          lead={t('notificationsHint')}
        >
          {t('notifications')}
        </SectionTitle>
        <fieldset>
          <legend className="sr-only">{t('notifications')}</legend>
          <div className="-mx-2 grid gap-x-6 @2xl:grid-cols-2">
            {NOTIFICATION_PREF_TYPES.map((type) => (
              <SwitchRow
                key={type}
                label={vocabulary(t, 'notifTypes.', type)}
                checked={!draft.mutedNotificationTypes.includes(type)}
                onChange={() =>
                  set(
                    'mutedNotificationTypes',
                    toggleIn(draft.mutedNotificationTypes, type),
                  )
                }
              />
            ))}
          </div>
        </fieldset>
        <div className="-mx-2 mt-4 border-t border-line pt-4">
          <SwitchRow
            label={t('messageEmail')}
            hint={me.emailAvailable ? undefined : t('messageEmailUnavailable')}
            checked={draft.messageEmail && me.emailAvailable}
            disabled={!me.emailAvailable}
            onChange={(v) => set('messageEmail', v)}
          />
        </div>
      </section>

      <FormError>{errors.form}</FormError>

      {/* The save bar stays at the bottom of the screen while the form is
          in view, and says whether anything is left to save. */}
      <div className="sticky bottom-0 z-20 -mx-1 rounded-md border border-line bg-surface/95 px-4 py-3 shadow-pop backdrop-blur supports-[backdrop-filter]:bg-surface/85">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1 text-sm">
            {dirty ? (
              <span className="inline-flex items-center gap-2 font-medium text-ink">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full bg-bar-4"
                />
                {t('unsavedChanges')}
              </span>
            ) : null}
            {/* Mounted from the start, empty: a live region must exist
                BEFORE its text for the confirmation to be announced. */}
            <span role="status" className="text-bar-1">
              {saved && !dirty ? t('saved') : null}
            </span>
          </div>
          {dirty && exists ? (
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => {
                setErrors({});
                setDraft(() => baseline);
              }}
            >
              {t('discardChanges')}
            </Button>
          ) : null}
          <Button type="submit" className="min-h-11" disabled={pending}>
            {pending ? t('saving') : exists ? t('save') : t('create')}
          </Button>
        </div>
      </div>
    </form>
  );
}

// --- Photo -------------------------------------------------------------------------

function PhotoSection({ me, exists }: { me: Me; exists: boolean }) {
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
      <SectionTitle id="profil-photo" icon={Camera}>
        {t('sectionPhoto')}
      </SectionTitle>
      {exists ? (
        <div className="flex flex-wrap items-center gap-5">
          <PersonAvatar
            name={me.displayName}
            photoUrl={me.photoUrl}
            size={96}
            alt={t('photoAlt', { name: me.displayName })}
          />
          <div className="min-w-0 flex-1 basis-[16rem] space-y-2">
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
                <Camera aria-hidden="true" />
                {me.photoUrl ? t('photoChange') : t('photoChoose')}
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
                  <Trash2 aria-hidden="true" />
                  {t('photoRemove')}
                </Button>
              ) : null}
            </div>
            <label className="-mx-2 flex min-h-11 cursor-pointer items-center gap-2.5 rounded-sm px-2 text-sm text-ink hover:bg-surface-2">
              <Checkbox
                checked={crop}
                onCheckedChange={() => setCrop((c) => !c)}
              />
              {t('photoCrop')}
            </label>
            <p className="text-xs text-muted">{t('photoHint')}</p>
          </div>
        </div>
      ) : (
        <p className="flex items-start gap-3 rounded-sm border border-dashed border-line-strong bg-paper/40 p-4 text-sm leading-relaxed text-ink-soft">
          <Camera
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0 text-muted"
          />
          {t('photoNeedsProfile')}
        </p>
      )}
      <p
        role="status"
        className={cn(
          'mt-3 text-sm',
          message?.kind === 'error' ? 'text-bar-5' : 'text-bar-1',
        )}
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

// --- Interface language -------------------------------------------------------------

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
      <SectionTitle id="profil-langue" icon={Globe} lead={t('languageHint')}>
        {t('sectionPreferences')}
      </SectionTitle>
      <SelectField
        className="max-w-xs"
        label={t('language')}
        value={value}
        dir={directionOf(active)}
        onValueChange={async (v) => {
          const next = v as Locale;
          setValue(next);
          setSaved(false);
          await setPreferred({ locale: next });
          setSaved(true);
          if (next !== active) router.replace(pathname, { locale: next });
        }}
        // Each language under its own name, marked in its own language.
        options={routing.locales.map((l) => ({
          value: l,
          label: LOCALE_ENDONYMS[l],
          lang: l,
        }))}
      />
      <p role="status" className="mt-2 text-sm text-bar-1">
        {saved ? t('languageSaved') : null}
      </p>
    </section>
  );
}

// --- Blocked members ----------------------------------------------------------------

function BlockedList() {
  const t = useTranslations('profile');
  const blocks = useQuery(api.social.messages.myBlocks);
  const unblock = useMutation(api.social.messages.unblock);
  return (
    <section className={SECTION} aria-labelledby="profil-bloques">
      <SectionTitle
        id="profil-bloques"
        icon={ShieldOff}
        lead={t('blockedHint')}
      >
        {t('sectionBlocked')}
      </SectionTitle>
      {blocks === undefined ? (
        <Skeleton className="h-10 w-full" />
      ) : blocks.length === 0 ? (
        <p className="text-sm text-ink-soft">{t('blockedEmpty')}</p>
      ) : (
        <ul className="divide-y divide-line rounded-sm border border-line">
          {blocks.map((b) => (
            <li
              key={b.userId}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-3">
                <PersonAvatar
                  name={b.displayName || t('unknownMember')}
                  photoUrl={null}
                  size={32}
                />
                <span className="wrap-anywhere text-sm text-ink">
                  {b.displayName || t('unknownMember')}
                </span>
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

// --- GDPR export --------------------------------------------------------------------

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
      <SectionTitle id="profil-donnees" icon={Download} lead={t('exportHint')}>
        {t('sectionData')}
      </SectionTitle>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={pending}
          onClick={download}
        >
          <Download aria-hidden="true" />
          {t('exportCta')}
        </Button>
        <Link
          href="/espace-membre/donnees"
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent-text hover:underline"
        >
          {t('allMyData')}
        </Link>
      </div>
    </section>
  );
}
