'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import {
  Field,
  FormError,
  TextField,
  TextareaField,
  useFormFields,
} from '@/components/ui/field';
import { SelectField } from '@/components/ui/choice-fields';
import {
  CheckboxChoice,
  CheckboxChoiceIndicator,
} from '@/components/ui/checkbox';
import {
  RadioGroup,
  RadioGroupChoice,
  RadioGroupChoiceIndicator,
} from '@/components/ui/radio-group';
import { ProgressBar } from '@/components/ui/progress-bar';
import {
  PUB_TYPES,
  PUB_THEMES,
  PUB_REGIONS,
  PUB_LANGS,
  PUB_ACCESS,
} from '@/lib/publications';
import { isRateLimited } from '@/lib/errors';
import { UPLOAD_FAILED, uploadWithProgress } from '@/lib/upload';
import { vocabulary } from '@/i18n/vocabulary';
import { StatusMessage } from '@/components/a11y/status-message';

const MAX_FILE_MB = 20;
// The language and access chips: shadcn `CheckboxChoice` and
// `RadioGroupChoice`, drawn alike.
const CHIP = 'rounded-pill px-4 py-1.5';

// The CONTENT, not the extension: a `.txt` renamed `.pdf`, or an empty file,
// got past the picker (`accept`) and the server, which can only check the
// size and declared type (measured on 27/09). A PDF starts with `%PDF-`.
async function looksLikePdf(file: File): Promise<boolean> {
  if (file.size < 5) return false;
  try {
    return (await file.slice(0, 5).text()) === '%PDF-';
  } catch {
    return true; // browser without `Blob.text()`: let the server decide
  }
}
const CURRENT_YEAR = new Date().getFullYear();

type Status = 'idle' | 'uploading' | 'sending' | 'success';

// Publication submission form (F-32) — client island. Convex Storage
// upload flow: generateUploadUrl -> POST the file -> storageId
// -> submitPublication. The submission starts in "pending" status and only appears
// publicly after a moderator approves it. Validated client-side AND server-side.
export function PublicationSubmitForm() {
  const t = useTranslations('library');
  const me = useQuery(api.users.current);
  const generateUploadUrl = useMutation(api.publications.generateUploadUrl);
  const submit = useMutation(api.publications.submitPublication);

  const [type, setType] = useState<string>(PUB_TYPES[0]);
  const [theme, setTheme] = useState<string>(PUB_THEMES[0]);
  const [region, setRegion] = useState<string>(PUB_REGIONS[0]);
  const [languages, setLanguages] = useState<string[]>(['fr']);
  const [access, setAccess] = useState<string>(PUB_ACCESS[0]);
  const [file, setFile] = useState<File | null>(null);

  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [submittedTitle, setSubmittedTitle] = useState('');
  const {
    values,
    field,
    setValue,
    validate,
    reset: resetFields,
  } = useFormFields({
    title: '',
    year: String(CURRENT_YEAR),
    authors: '',
    abstract: '',
    keypoints: '',
  });
  // The languages (checkboxes) and the file are not text fields:
  // their messages live here, but follow the same rule — each one is shown at
  // the faulty spot, not at the bottom of the form.
  const [groupErrors, setGroupErrors] = useState<{
    languages?: string;
    file?: string;
  }>({});
  const languagesErrorId = useId();
  const accessLegendId = useId();
  // The language group has no single control to target: it is the
  // `fieldset` that takes focus (`tabIndex={-1}`), which brings the legend and
  // the message on screen and under the screen reader.
  const languagesRef = useRef<HTMLFieldSetElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Pre-fills the lead author with the signed-in member's name (once).
  useEffect(() => {
    if (me?.name && values.authors.trim() === '') setValue('authors', me.name);
  }, [me, values.authors, setValue]);

  function toggleLang(l: string) {
    setLanguages((cur) =>
      cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l],
    );
    setGroupErrors((cur) => ({ ...cur, languages: undefined }));
  }

  function reset() {
    resetFields({ authors: me?.name ?? '' });
    setType(PUB_TYPES[0]);
    setTheme(PUB_THEMES[0]);
    setRegion(PUB_REGIONS[0]);
    setLanguages(['fr']);
    setAccess(PUB_ACCESS[0]);
    setFile(null);
    // The file field is the only control not driven by state (an
    // `<input type="file">` is not filled via `value`): it is cleared
    // by hand, otherwise it would keep announcing the previous document.
    if (fileRef.current) fileRef.current.value = '';
    setGroupErrors({});
    setError(null);
    setPercent(null);
    setStatus('idle');
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    // Mirrors the backend validation (defence in depth on the server side too),
    // but cause by cause: a rejected submission now says WHICH of the six
    // fields to fix.
    const groups: { languages?: string; file?: string } = {};
    if (languages.length === 0) groups.languages = t('submit.errLanguages');
    if (file && file.size > MAX_FILE_MB * 1024 * 1024) {
      groups.file = t('submit.errorFileSize', { mb: MAX_FILE_MB });
    } else if (file && !(await looksLikePdf(file))) {
      groups.file = t('submit.errorFileType');
    }
    setGroupErrors(groups);

    const fieldsOk = validate({
      title: (v) => (v.trim().length < 4 ? t('submit.errTitle') : null),
      year: (v) => {
        const year = Number(v);
        const valid =
          Number.isInteger(year) && year >= 1990 && year <= CURRENT_YEAR + 1;
        // `max` is passed as TEXT: as a numeric argument, ICU would write
        // "2 027".
        return valid
          ? null
          : t('submit.errYear', { max: String(CURRENT_YEAR + 1) });
      },
      authors: (v) =>
        v.split('\n').some((line) => line.trim())
          ? null
          : t('submit.errAuthors'),
      abstract: (v) => (v.trim().length < 20 ? t('submit.errAbstract') : null),
    });
    // Focus has already moved to the first faulty text field, if there is
    // one; otherwise it goes to the blocking group.
    if (!fieldsOk) return;
    if (groups.languages) {
      languagesRef.current?.focus();
      return;
    }
    if (groups.file) {
      fileRef.current?.focus();
      return;
    }

    const title = values.title.trim();
    const authorList = values.authors
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => ({ name }));
    const keypoints = values.keypoints
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      let fileId: Id<'_storage'> | undefined;
      let fileName: string | undefined;
      if (file) {
        setPercent(null);
        setStatus('uploading');
        const uploadUrl = await generateUploadUrl();
        // `XMLHttpRequest`, not `fetch`: only it reports
        // UPLOAD progress (see src/lib/upload.ts).
        const json = await uploadWithProgress<{ storageId: Id<'_storage'> }>({
          url: uploadUrl,
          file,
          contentType: file.type || 'application/pdf',
          onProgress: (progress) => setPercent(progress.percent),
        });
        fileId = json.storageId;
        fileName = file.name;
      }

      setStatus('sending');
      await submit({
        title,
        type: type as (typeof PUB_TYPES)[number],
        theme: theme as (typeof PUB_THEMES)[number],
        region: region as (typeof PUB_REGIONS)[number],
        languages: languages as (typeof PUB_LANGS)[number][],
        access: access as (typeof PUB_ACCESS)[number],
        year: Number(values.year),
        authors: authorList,
        abstract: values.abstract.trim(),
        keypoints: keypoints.length ? keypoints : undefined,
        fileId,
        fileName,
      });
      setSubmittedTitle(title);
      setStatus('success');
    } catch (err) {
      setError(
        isRateLimited(err)
          ? t('submit.rateLimited')
          : err instanceof Error && err.message === UPLOAD_FAILED
            ? t('submit.errorFile')
            : err instanceof Error && /INVALID_FILE/.test(err.message)
              ? t('submit.errorFileType')
              : t('submit.errorGeneric'),
      );
      // The input stays in place: a rejection is no reason to start
      // over (nor is the chosen file).
      setStatus('idle');
      setPercent(null);
    }
  }

  if (status === 'success') {
    return (
      <StatusMessage className="rounded-md border border-line bg-surface p-6 shadow-card sm:p-8">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-accent-tint text-accent-text">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="m5 13 4 4L19 7"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <h2 className="mt-4 font-display text-2xl text-ink">
          {t('submit.successTitle')}
        </h2>
        <p className="mt-3 max-w-[52ch] leading-relaxed text-ink-soft">
          {t('submit.successBody', { title: submittedTitle })}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/espace-membre">{t('submit.successCta')}</Link>
          </Button>
          <Button variant="outline" onClick={reset} type="button">
            {t('submit.submitAnother')}
          </Button>
        </div>
      </StatusMessage>
    );
  }

  const busy = status === 'uploading' || status === 'sending';

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="space-y-6 rounded-md border border-line bg-surface p-6 shadow-card sm:p-8"
    >
      <TextField
        label={t('submit.fieldTitle')}
        required
        maxLength={200}
        {...field('title')}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          label={t('submit.fieldType')}
          value={type}
          onValueChange={setType}
          options={PUB_TYPES.map((opt) => ({
            value: opt,
            label: vocabulary(t, 'types.', opt),
          }))}
        />
        <SelectField
          label={t('submit.fieldTheme')}
          value={theme}
          onValueChange={setTheme}
          options={PUB_THEMES.map((opt) => ({
            value: opt,
            label: vocabulary(t, 'themes.', opt),
          }))}
        />
        <SelectField
          label={t('submit.fieldRegion')}
          value={region}
          onValueChange={setRegion}
          options={PUB_REGIONS.map((opt) => ({
            value: opt,
            label: vocabulary(t, 'regions.', opt),
          }))}
        />
        <TextField
          label={t('submit.fieldYear')}
          type="number"
          inputMode="numeric"
          min={1990}
          max={CURRENT_YEAR + 1}
          required
          {...field('year')}
        />
      </div>

      <fieldset
        ref={languagesRef}
        tabIndex={-1}
        aria-describedby={groupErrors.languages ? languagesErrorId : undefined}
      >
        <legend className="text-sm text-ink-soft">
          {t('submit.fieldLanguages')}
        </legend>
        {/* Each chip IS the checkbox (shadcn `CheckboxChoice`): it carries
            the focus outline itself (RGAA 10.7), and a tick shows the choice
            without relying on colour alone (RGAA 3.1). */}
        <div className="mt-2 flex flex-wrap gap-2">
          {PUB_LANGS.map((l) => (
            <CheckboxChoice
              key={l}
              checked={languages.includes(l)}
              onCheckedChange={() => toggleLang(l)}
              className={CHIP}
            >
              <CheckboxChoiceIndicator />
              {vocabulary(t, 'langs.', l)}
            </CheckboxChoice>
          ))}
        </div>
        {groupErrors.languages ? (
          <p id={languagesErrorId} className="mt-1 text-sm text-bar-5">
            {groupErrors.languages}
          </p>
        ) : null}
      </fieldset>

      <fieldset>
        <legend id={accessLegendId} className="text-sm text-ink-soft">
          {t('submit.fieldAccess')}
        </legend>
        {/* Never an ANONYMOUS `role="radiogroup"` (RGAA 11.6): it sits
            between the chips and the `<fieldset>`, hence `aria-labelledby`
            on the legend. */}
        <RadioGroup
          value={access}
          onValueChange={setAccess}
          aria-labelledby={accessLegendId}
          className="mt-2 flex flex-wrap gap-2"
        >
          {PUB_ACCESS.map((a) => (
            <RadioGroupChoice key={a} value={a} className={CHIP}>
              <RadioGroupChoiceIndicator />
              {vocabulary(t, 'access.', a)}
            </RadioGroupChoice>
          ))}
        </RadioGroup>
      </fieldset>

      <TextareaField
        label={t('submit.fieldAuthors')}
        hint={t('submit.authorsHint')}
        rows={3}
        required
        {...field('authors')}
      />

      <TextareaField
        label={t('submit.fieldAbstract')}
        hint={t('submit.abstractHint')}
        rows={6}
        required
        maxLength={4000}
        {...field('abstract')}
      />

      <TextareaField
        label={t('submit.fieldKeypoints')}
        hint={t('submit.keypointsHint')}
        rows={3}
        {...field('keypoints')}
      />

      {/* File field: a special control (`file:*` styling), so rendered
          through the shared system's shell rather than reassembled by hand. */}
      <Field
        label={t('submit.fieldFile')}
        hint={
          file
            ? t('submit.fileSelected', { name: file.name })
            : t('submit.fileHint', { mb: MAX_FILE_MB })
        }
        error={groupErrors.file}
      >
        {(control) => (
          <input
            {...control}
            ref={fileRef}
            name="file"
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setGroupErrors((cur) => ({ ...cur, file: undefined }));
            }}
            className="block w-full text-sm text-ink-soft file:me-3 file:cursor-pointer file:rounded-sm file:border file:border-line-strong file:bg-surface-2 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-line"
          />
        )}
      </Field>

      {status === 'uploading' ? (
        <ProgressBar
          label={t('submit.uploadProgress')}
          percent={percent}
          text={
            percent === null
              ? t('submit.uploadStarting')
              : t('submit.uploadPercent', { percent })
          }
        />
      ) : null}

      <FormError>{error}</FormError>

      <Button type="submit" disabled={busy} className="w-full sm:w-auto">
        {status === 'uploading'
          ? t('submit.uploading')
          : status === 'sending'
            ? t('submit.sending')
            : t('submit.submit')}
      </Button>
    </form>
  );
}
