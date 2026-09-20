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
  SelectField,
  TextField,
  TextareaField,
  useFormFields,
} from '@/components/ui/field';
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

const MAX_FILE_MB = 20;
const CURRENT_YEAR = new Date().getFullYear();

type Status = 'idle' | 'uploading' | 'sending' | 'success';

// Formulaire de dépôt d'une publication (F-32) — îlot client. Flux de
// téléversement Convex Storage : generateUploadUrl -> POST du fichier -> storageId
// -> submitPublication. La soumission part en statut « en attente » et n'apparaît
// publiquement qu'après validation d'un modérateur. Validé côté client ET serveur.
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
  // Les langues (cases à cocher) et le fichier ne sont pas des champs texte :
  // leurs messages vivent ici, mais suivent la même règle — chacun s'affiche à
  // l'endroit fautif, et non en bas du formulaire.
  const [groupErrors, setGroupErrors] = useState<{
    languages?: string;
    file?: string;
  }>({});
  const languagesErrorId = useId();
  // Le groupe de langues n'a pas de contrôle unique à viser : c'est le
  // `fieldset` qui prend le focus (`tabIndex={-1}`), ce qui amène la légende et
  // le message à l'écran et sous le lecteur d'écran.
  const languagesRef = useRef<HTMLFieldSetElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Pré-remplit l'auteur principal avec le nom du membre connecté (une fois).
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
    // Le champ fichier est le seul contrôle non piloté par l'état (un
    // `<input type="file">` ne se remplit pas par `value`) : il se vide à la
    // main, faute de quoi il continuerait d'annoncer le document précédent.
    if (fileRef.current) fileRef.current.value = '';
    setGroupErrors({});
    setError(null);
    setPercent(null);
    setStatus('idle');
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    // Validation miroir du backend (défense en profondeur côté serveur aussi),
    // mais cause par cause : un dépôt refusé dit désormais LEQUEL des six
    // champs reprendre.
    const groups: { languages?: string; file?: string } = {};
    if (languages.length === 0) groups.languages = t('submit.errLanguages');
    if (file && file.size > MAX_FILE_MB * 1024 * 1024) {
      groups.file = t('submit.errorFileSize', { mb: MAX_FILE_MB });
    }
    setGroupErrors(groups);

    const fieldsOk = validate({
      title: (v) => (v.trim().length < 4 ? t('submit.errTitle') : null),
      year: (v) => {
        const year = Number(v);
        const valid =
          Number.isInteger(year) && year >= 1990 && year <= CURRENT_YEAR + 1;
        // `max` est passé en TEXTE : en argument numérique, l'ICU écrirait
        // « 2 027 ».
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
    // Le focus est déjà parti sur le premier champ texte fautif, s'il y en a
    // un ; sinon il va au groupe qui bloque.
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
        // `XMLHttpRequest`, et non `fetch` : lui seul rend compte de
        // l'avancement de l'ENVOI (cf. src/lib/upload.ts).
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
            : t('submit.errorGeneric'),
      );
      // La saisie reste en place : un refus n'est pas une raison de tout
      // reprendre (le fichier choisi non plus).
      setStatus('idle');
      setPercent(null);
    }
  }

  if (status === 'success') {
    return (
      <div
        role="status"
        className="rounded-md border border-line bg-surface p-6 shadow-card sm:p-8"
      >
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
      </div>
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
          onChange={(e) => setType(e.target.value)}
        >
          {PUB_TYPES.map((opt) => (
            <option key={opt} value={opt}>
              {t(`types.${opt}`)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('submit.fieldTheme')}
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
        >
          {PUB_THEMES.map((opt) => (
            <option key={opt} value={opt}>
              {t(`themes.${opt}`)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('submit.fieldRegion')}
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        >
          {PUB_REGIONS.map((opt) => (
            <option key={opt} value={opt}>
              {t(`regions.${opt}`)}
            </option>
          ))}
        </SelectField>
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
        <div className="mt-2 flex flex-wrap gap-2">
          {PUB_LANGS.map((l) => {
            const checked = languages.includes(l);
            return (
              <label
                key={l}
                className={`cursor-pointer rounded-pill border px-4 py-1.5 text-sm font-medium transition-colors ${
                  checked
                    ? 'border-accent-edge bg-accent-tint text-accent-text'
                    : 'border-line bg-surface-2 text-ink-soft hover:border-line-strong hover:text-ink'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleLang(l)}
                  className="sr-only"
                />
                {t(`langs.${l}`)}
              </label>
            );
          })}
        </div>
        {groupErrors.languages ? (
          <p id={languagesErrorId} className="mt-1 text-sm text-bar-5">
            {groupErrors.languages}
          </p>
        ) : null}
      </fieldset>

      <fieldset>
        <legend className="text-sm text-ink-soft">
          {t('submit.fieldAccess')}
        </legend>
        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup">
          {PUB_ACCESS.map((a) => (
            <label
              key={a}
              className={`cursor-pointer rounded-pill border px-4 py-1.5 text-sm font-medium transition-colors ${
                access === a
                  ? 'border-accent-edge bg-accent-tint text-accent-text'
                  : 'border-line bg-surface-2 text-ink-soft hover:border-line-strong hover:text-ink'
              }`}
            >
              <input
                type="radio"
                name="access"
                value={a}
                checked={access === a}
                onChange={() => setAccess(a)}
                className="sr-only"
              />
              {t(`access.${a}`)}
            </label>
          ))}
        </div>
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

      {/* Champ fichier : contrôle particulier (habillage `file:*`), donc rendu
          par la coquille du système commun plutôt que réassemblé à la main. */}
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
            className="block w-full text-sm text-ink-soft file:mr-3 file:cursor-pointer file:rounded-sm file:border file:border-line-strong file:bg-surface-2 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-line"
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
