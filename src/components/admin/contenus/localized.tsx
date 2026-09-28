'use client';

import { useId, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { SITE_LOCALES, type SiteLocale } from '@convex/lib/locales';
import { vocabulary } from '@/i18n/vocabulary';
import { TextField, TextareaField } from '@/components/ui/field';
import { cn } from '@/lib/utils';

// ENTRY OF TRANSLATABLE TEXTS — one language at a time, gaps visible.
//
// A piece of content carries its five languages in the same document
// (`localizedText`, convex/lib/contenus/i18n.ts). The editor picks ONE
// editing language for the whole form — rather than five fields per text,
// which would flood the screen — and each language button says whether a
// translation is missing there. The public never sees an empty field: it
// sees the fallback (French, then English), and the preview shows it as is.

export type LText = Partial<Record<SiteLocale, string>>;
export type LList = Partial<Record<SiteLocale, string[]>>;

export const EMPTY_TEXT: LText = {};

function filled(v: string | string[] | undefined): boolean {
  if (Array.isArray(v)) return v.some((s) => s.trim().length > 0);
  return typeof v === 'string' && v.trim().length > 0;
}

/** Languages where AT LEAST ONE of the required texts is missing. */
export function missingIn(texts: (LText | LList | undefined)[]): SiteLocale[] {
  return SITE_LOCALES.filter((l) => texts.some((tx) => !filled(tx?.[l])));
}

/** Same fallback as the server: requested language, French, English, other. */
export function previewText(
  text: LText | undefined,
  lang: SiteLocale,
): { text: string; fallback: boolean } {
  if (text && filled(text[lang])) return { text: text[lang]!, fallback: false };
  for (const l of ['fr', 'en', 'es', 'pt', 'ar'] as const) {
    if (text && filled(text[l])) return { text: text[l]!, fallback: true };
  }
  return { text: '', fallback: true };
}

export function useLangName() {
  const t = useTranslations('contentAdmin');
  return (l: string) => vocabulary(t, 'lang_', l, l.toUpperCase());
}

/** Editing-language picker, with the missing-language indicator. */
export function LangSwitch({
  value,
  onChange,
  missing,
}: {
  value: SiteLocale;
  onChange: (l: SiteLocale) => void;
  missing: SiteLocale[];
}) {
  const t = useTranslations('contentAdmin');
  const langName = useLangName();
  const labelId = useId();
  return (
    <div>
      <span id={labelId} className="block text-sm text-ink-soft">
        {t('langTabsLabel')}
      </span>
      <div
        role="group"
        aria-labelledby={labelId}
        className="mt-1 flex flex-wrap gap-1.5"
      >
        {SITE_LOCALES.map((l) => {
          const isMissing = missing.includes(l);
          return (
            <button
              key={l}
              type="button"
              aria-pressed={value === l}
              aria-label={
                isMissing ? t('langMissing', { lang: langName(l) }) : undefined
              }
              onClick={() => onChange(l)}
              className={cn(
                'inline-flex min-h-11 items-center gap-1.5 rounded-sm border px-3 text-sm transition-colors',
                value === l
                  ? 'border-accent-edge bg-accent-tint font-semibold text-accent-text'
                  : 'border-line-strong bg-surface text-ink-soft hover:text-ink',
              )}
            >
              <span lang={l}>{langName(l)}</span>
              {isMissing ? (
                // Decorative dot: the information is in `aria-label`.
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 rounded-full bg-bar-5"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A translatable text, entered in the current language. */
export function LocalizedInput({
  label,
  value,
  onChange,
  lang,
  multiline = false,
  hint,
  required = false,
  maxLength,
  rows = 3,
}: {
  label: ReactNode;
  value: LText;
  onChange: (v: LText) => void;
  lang: SiteLocale;
  multiline?: boolean;
  hint?: ReactNode;
  required?: boolean;
  maxLength?: number;
  rows?: number;
}) {
  const t = useTranslations('contentAdmin');
  const fullHint = (
    <>
      {hint ? <>{hint} </> : null}
      {!filled(value[lang]) ? t('fallbackHint') : null}
    </>
  );
  const common = {
    label,
    hint: fullHint,
    lang,
    dir: lang === 'ar' ? 'rtl' : 'ltr',
    value: value[lang] ?? '',
    maxLength,
    // Required in AT LEAST one language (server rule): the field only requires
    // it from the browser while no language is filled in.
    required: required && !SITE_LOCALES.some((l) => filled(value[l])),
  } as const;
  return multiline ? (
    <TextareaField
      {...common}
      rows={rows}
      onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
    />
  ) : (
    <TextField
      {...common}
      onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
    />
  );
}

// Translatable list entered as text: paragraphs separated by a blank line
// (`separator: 'paragraph'`) or one entry per line (`'line'`).
export function listToText(
  list: string[] | undefined,
  sep: 'paragraph' | 'line',
) {
  return (list ?? []).join(sep === 'paragraph' ? '\n\n' : '\n');
}
export function textToList(text: string, sep: 'paragraph' | 'line'): string[] {
  return text
    .split(sep === 'paragraph' ? /\n\s*\n/ : /\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function LocalizedListInput({
  label,
  value,
  onChange,
  lang,
  separator,
  hint,
}: {
  label: ReactNode;
  value: LList;
  onChange: (v: LList) => void;
  lang: SiteLocale;
  separator: 'paragraph' | 'line';
  hint: ReactNode;
}) {
  // RAW draft per language: splitting into entries removes blank lines,
  // and redisplaying the split value would make the cursor jump on every
  // keystroke (impossible to type the blank line separating two paragraphs).
  const [drafts, setDrafts] = useState<Partial<Record<SiteLocale, string>>>({});
  const text = drafts[lang] ?? listToText(value[lang], separator);
  return (
    <TextareaField
      label={label}
      hint={hint}
      lang={lang}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      rows={6}
      value={text}
      onChange={(e) => {
        setDrafts({ ...drafts, [lang]: e.target.value });
        onChange({ ...value, [lang]: textToList(e.target.value, separator) });
      }}
    />
  );
}

/** Status pill for a piece of content. */
export function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('contentAdmin');
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill border px-2.5 py-0.5 text-[12px] font-medium',
        status === 'published'
          ? 'border-accent-edge bg-accent-tint text-accent-text'
          : 'border-line-strong bg-surface-2 text-ink-soft',
      )}
    >
      {vocabulary(t, 'status_', status)}
    </span>
  );
}

/** "traductions" column of a list: complete, or the languages to translate. */
export function MissingLangs({ missing }: { missing: string[] }) {
  const t = useTranslations('contentAdmin');
  const langName = useLangName();
  if (missing.length === 0)
    return <span className="text-[12px] text-muted">{t('complete')}</span>;
  return (
    <span className="text-[12px] text-ink-soft">
      {t('missingLangs', { langs: missing.map(langName).join(', ') })}
    </span>
  );
}
