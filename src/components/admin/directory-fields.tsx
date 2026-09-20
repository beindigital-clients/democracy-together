'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { REGIONS, DIRECTORY_THEMES } from '@convex/lib/directory';
import { Button } from '@/components/ui/button';
import { FormError, SelectField, TextField } from '@/components/ui/field';

export type DirectoryDraft = {
  countryCode: string;
  region: string;
  themes: string[];
  languages: string[];
  description?: string;
  websiteUrl?: string;
};

const LANGS = ['fr', 'en'] as const;

// Saisie des champs d'annuaire au moment d'approuver une candidature
// d'organisation (F-19/F-22). La candidature ne collecte qu'un pays en texte
// libre, alors que l'annuaire attend un code pays et un vocabulaire fermé de
// régions et de thématiques : c'est donc au modérateur de compléter, plutôt
// que de laisser le système deviner et publier une fiche fausse.
export function DirectoryFields({
  organizationName,
  pending,
  onConfirm,
  onApproveWithout,
  onCancel,
}: {
  organizationName: string;
  pending: boolean;
  onConfirm: (draft: DirectoryDraft) => void;
  onApproveWithout: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('admin');
  const [countryCode, setCountryCode] = useState('');
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
        <TextField
          label={t('dirCountry')}
          value={countryCode}
          maxLength={2}
          onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
          placeholder="SN"
          controlClassName="max-w-[8rem]"
        />
        <SelectField
          label={t('dirRegion')}
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        >
          <option value="">—</option>
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </SelectField>
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm text-ink-soft">{t('dirThemes')}</legend>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          {DIRECTORY_THEMES.map((th) => (
            <label key={th} className="flex items-center gap-1.5 text-[13px]">
              <input
                type="checkbox"
                checked={themes.includes(th)}
                onChange={() => setThemes((prev) => toggle(prev, th))}
              />
              {th}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-4">
        <legend className="text-sm text-ink-soft">{t('dirLanguages')}</legend>
        <div className="mt-2 flex gap-4">
          {LANGS.map((l) => (
            <label key={l} className="flex items-center gap-1.5 text-[13px]">
              <input
                type="checkbox"
                checked={languages.includes(l)}
                onChange={() => setLanguages((prev) => toggle(prev, l))}
              />
              {l.toUpperCase()}
            </label>
          ))}
        </div>
      </fieldset>

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
