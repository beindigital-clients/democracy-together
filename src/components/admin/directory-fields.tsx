'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { REGIONS, DIRECTORY_THEMES } from '@convex/lib/directory';
import { routing } from '@/i18n/routing';
import { vocabulary } from '@/i18n/vocabulary';
import { directionOf } from '@/i18n/direction';
import { countryOptions, guessCountryCode } from '@/lib/countries';
import { languageName } from '@/lib/orgs';
import { Button } from '@/components/ui/button';
import { FormError, TextField } from '@/components/ui/field';
import { ComboboxField, SelectMenuField } from '@/components/ui/choice-fields';
import { ChipGroup } from '@/components/social/profile-controls';
import { PUB_LANGS } from '@/lib/publications';

export type DirectoryDraft = {
  countryCode: string;
  region: string;
  themes: string[];
  languages: string[];
  description?: string;
  websiteUrl?: string;
};

// The working languages offered for entry are the ones the site serves:
// a single declaration for the library facet, the directory and the
// language switcher. Copying the list here would make it diverge the day a
// sixth language arrives.
const LANGS = PUB_LANGS;

// Entry of directory fields when approving an organization's application
// (F-19/F-22). The application only collects a country as free text,
// whereas the directory expects a country code and a closed vocabulary of
// regions and themes: so it is up to the moderator to complete it, rather
// than letting the system guess and publish a wrong entry.
//
// The country is PICKED by name from a searchable list, and pre-selected
// only when the applicant's text names a country exactly ("Sénégal",
// "Senegal"). It used to be a two-letter code to type, whose "SN"
// placeholder read as a value already entered: the approval was then
// refused as incomplete, without the moderator seeing why. Regions and
// themes are shown by their names, not their slugs.
export function DirectoryFields({
  organizationName,
  countryText,
  pending,
  onConfirm,
  onApproveWithout,
  onCancel,
}: {
  organizationName: string;
  // The country as the applicant wrote it.
  countryText?: string;
  pending: boolean;
  onConfirm: (draft: DirectoryDraft) => void;
  onApproveWithout: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('admin');
  const td = useTranslations('directory');
  const tp = useTranslations('profile');
  const locale = useLocale();
  const countries = useMemo(
    () => countryOptions(locale).map((c) => ({ value: c.code, label: c.name })),
    [locale],
  );
  const [countryCode, setCountryCode] = useState(
    () => guessCountryCode(countryText, [locale, ...routing.locales]) ?? '',
  );
  const [region, setRegion] = useState('');
  const [themes, setThemes] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>(['fr']);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState(false);

  const complete =
    /^[A-Za-z]{2}$/.test(countryCode.trim()) &&
    region !== '' &&
    themes.length > 0 &&
    languages.length > 0;

  function toggle(list: string[], value: string): string[] {
    return list.includes(value)
      ? list.filter((v) => v !== value)
      : [...list, value];
  }

  return (
    <div className="mt-4 rounded-sm border border-line bg-surface-2 p-4">
      <h3 className="font-display text-base">{t('dirTitle')}</h3>
      <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-ink-soft">
        {t('dirHint')}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <ComboboxField
          label={t('dirCountry')}
          hint={
            countryText ? t('dirCountryHint', { country: countryText }) : null
          }
          value={countryCode}
          onValueChange={setCountryCode}
          options={countries}
          placeholder={t('dirCountryPlaceholder')}
          searchLabel={tp('countrySearchLabel')}
          searchPlaceholder={tp('countrySearchPlaceholder')}
          noResults={tp('countryNoResults')}
        />
        <SelectMenuField
          label={t('dirRegion')}
          value={region}
          onValueChange={setRegion}
          placeholder={t('dirRegionPlaceholder')}
          dir={directionOf(locale)}
          options={REGIONS.map((r) => ({
            value: r,
            label: vocabulary(td, 'regions.', r),
          }))}
        />
      </div>

      <div className="mt-5 space-y-5">
        <ChipGroup
          legend={t('dirThemes')}
          options={DIRECTORY_THEMES.map((th) => ({
            value: th,
            label: vocabulary(td, 'themes.', th),
          }))}
          value={themes}
          onToggle={(th) => setThemes((prev) => toggle(prev, th))}
        />
        <ChipGroup
          legend={t('dirLanguages')}
          options={LANGS.map((l) => ({
            value: l,
            label: languageName(l, locale),
          }))}
          value={languages}
          onToggle={(l) => setLanguages((prev) => toggle(prev, l))}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <TextField
          label={t('dirWebsite')}
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          placeholder="https://"
        />
        <TextField
          label={t('dirDescription')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <FormError className="mt-3 text-[13px]">
        {error ? t('dirIncomplete') : null}
      </FormError>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button
          disabled={pending}
          onClick={() => {
            if (!complete) {
              setError(true);
              return;
            }
            setError(false);
            onConfirm({
              countryCode: countryCode.trim().toUpperCase(),
              region,
              themes,
              languages,
              description: description.trim() || undefined,
              websiteUrl: websiteUrl.trim() || undefined,
            });
          }}
        >
          {t('dirConfirm')}
        </Button>
        <Button variant="outline" disabled={pending} onClick={onApproveWithout}>
          {t('dirLater')}
        </Button>
        <Button variant="outline" disabled={pending} onClick={onCancel}>
          {t('dirCancel')}
        </Button>
      </div>
      <p className="mt-2 max-w-[70ch] text-xs text-muted">
        {t('dirLaterHint')}
      </p>
      <span className="sr-only">{organizationName}</span>
    </div>
  );
}
