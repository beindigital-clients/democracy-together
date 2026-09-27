'use client';

import { useId, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { SITE_LOCALES, type SiteLocale } from '@convex/lib/locales';
import { vocabulary } from '@/i18n/vocabulary';
import { TextField, TextareaField } from '@/components/ui/field';
import { cn } from '@/lib/utils';

// SAISIE DES TEXTES TRADUISIBLES — une langue à la fois, les manques visibles.
//
// Un contenu porte ses cinq langues dans le même document (`localizedText`,
// convex/lib/contenus/i18n.ts). L'éditeur choisit UNE langue de saisie pour
// tout le formulaire — plutôt que cinq champs par texte, qui noieraient
// l'écran — et chaque bouton de langue dit si une traduction y manque. Le
// public ne voit jamais un champ vide : il voit le repli (français, puis
// anglais), et l'aperçu le montre tel quel.

export type LText = Partial<Record<SiteLocale, string>>;
export type LList = Partial<Record<SiteLocale, string[]>>;

export const EMPTY_TEXT: LText = {};

function filled(v: string | string[] | undefined): boolean {
  if (Array.isArray(v)) return v.some((s) => s.trim().length > 0);
  return typeof v === 'string' && v.trim().length > 0;
}

/** Langues où AU MOINS UN des textes requis manque. */
export function missingIn(texts: (LText | LList | undefined)[]): SiteLocale[] {
  return SITE_LOCALES.filter((l) => texts.some((tx) => !filled(tx?.[l])));
}

/** Même repli que le serveur : langue demandée, français, anglais, autre. */
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

/** Choix de la langue de saisie, avec l'indicateur de langue manquante. */
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
                // Pastille décorative : l'information est dans `aria-label`.
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

/** Un texte traduisible, saisi dans la langue courante. */
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
    // Requis dans AU MOINS une langue (règle serveur) : le champ ne l'exige
    // du navigateur que tant qu'aucune langue n'est remplie.
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

// Liste traduisible saisie en texte : paragraphes séparés par une ligne vide
// (`separator: 'paragraph'`) ou une entrée par ligne (`'line'`).
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
  // Brouillon BRUT par langue : la découpe en entrées retire les lignes vides,
  // et réafficher la valeur découpée ferait sauter le curseur à chaque frappe
  // (impossible de taper la ligne vide qui sépare deux paragraphes).
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

/** Pastille de statut d'un contenu. */
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

/** Colonne « traductions » d'une liste : complet, ou les langues à traduire. */
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
