'use client';

import { useState, type FormEvent } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { FIELD_MAX } from '@convex/lib/validation';
import { PROGRAMME_LIMITS, callWindowState } from '@convex/lib/programmes';
import type { SiteLocale } from '@convex/lib/locales';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import {
  Field,
  FormError,
  SelectField,
  TextField,
  TextareaField,
} from '@/components/ui/field';
import { vocabulary } from '@/i18n/vocabulary';
import { uploadWithProgress } from '@/lib/upload';
import { isMember } from '@/lib/roles';
import {
  CARD,
  MemberPageHeader,
  StatusPill,
  statusTone,
  useProgrammeError,
} from '@/components/programmes/shared';
import {
  CallWindowLine,
  type PublicCall,
} from '@/components/projects/calls-list';

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.docx,.xlsx,.pptx,.odt,.odp,.ods';

// Candidature à un appel (F-60) : brouillon, pièces jointes, dépôt. Tout se
// fait dans la fenêtre de l'appel ; le serveur le revérifie à chaque geste.
export function CallApplication({ slug }: { slug: string }) {
  const t = useTranslations('projects');
  const call = useQuery(api.projectCalls.getPublicCall, { slug });
  const me = useQuery(api.users.current);
  const application = useQuery(
    api.projectCalls.myApplicationForCall,
    call ? { callId: call._id } : 'skip',
  );
  const [now] = useState(() => Date.now());
  if (call === undefined || me === undefined)
    return <p className="mt-6 text-ink-soft">{t('loading')}</p>;
  if (call === null)
    return (
      <>
        <MemberPageHeader title={t('applyTitleGeneric')} />
        <p className="mt-6 text-ink-soft">{t('callNotFound')}</p>
      </>
    );
  const open = callWindowState(call, now) === 'open';
  return (
    <>
      <MemberPageHeader title={t('applyTitle', { title: call.title })} />
      <div className="mt-3">
        <CallWindowLine call={call} now={now} />
        <Link
          href={`/appels-a-projets/${call.slug}`}
          className="inline-flex min-h-11 items-center text-sm text-accent-text hover:underline"
        >
          {t('seeCall')}
        </Link>
      </div>
      {!isMember(me?.role) ? (
        <p className={`${CARD} mt-6 text-ink-soft`}>{t('gateBody')}</p>
      ) : application === undefined ? (
        <p className="mt-6 text-ink-soft">{t('loading')}</p>
      ) : application && application.status !== 'draft' ? (
        <Submitted application={application} />
      ) : !open ? (
        <p className={`${CARD} mt-6 text-ink-soft`}>
          {t('windowClosedNotice')}
        </p>
      ) : (
        <Draft call={call} application={application} />
      )}
    </>
  );
}

type MyApplication = NonNullable<
  FunctionReturnType<typeof api.projectCalls.myApplicationForCall>
>;

function Submitted({ application }: { application: MyApplication }) {
  const t = useTranslations('projects');
  const withdraw = useMutation(api.projectCalls.withdrawCallApplication);
  const errorMessage = useProgrammeError();
  const [error, setError] = useState<string | null>(null);
  return (
    <section className={`${CARD} mt-6`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="wrap-anywhere font-medium text-ink">
          {application.title}
        </h2>
        <StatusPill tone={statusTone(application.status)}>
          {vocabulary(t, 'appStatus_', application.status)}
        </StatusPill>
      </div>
      <p className="mt-2 text-[14px] text-ink-soft">
        {vocabulary(t, 'appStatusLead_', application.status)}
      </p>
      {application.decisionNote ? (
        <p className="mt-2 wrap-anywhere text-[14px] text-ink">
          {t('decisionNote')} {application.decisionNote}
        </p>
      ) : null}
      {application.status === 'submitted' ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-3 min-h-11"
          onClick={async () => {
            setError(null);
            try {
              await withdraw({ applicationId: application._id });
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          {t('withdraw')}
        </Button>
      ) : null}
      <FormError className="mt-2">{error}</FormError>
    </section>
  );
}

function Draft({
  call,
  application,
}: {
  call: PublicCall;
  application: MyApplication | null;
}) {
  const t = useTranslations('projects');
  const tl = useTranslations('library');
  const save = useMutation(api.projectCalls.saveCallApplication);
  const submit = useMutation(api.projectCalls.submitCallApplication);
  const errorMessage = useProgrammeError();
  const [title, setTitle] = useState(application?.title ?? '');
  const [summary, setSummary] = useState(application?.summary ?? '');
  const [language, setLanguage] = useState<string>(
    application?.language ?? call.languages[0] ?? 'fr',
  );
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setStatus(null);
    if (title.trim().length < 4) return setError(t('errTitle'));
    if (summary.trim().length < 20) return setError(t('errSummary'));
    setPending(true);
    try {
      await save({
        callId: call._id,
        title: title.trim(),
        summary: summary.trim(),
        language: language as SiteLocale,
      });
      setStatus(t('draftSaved'));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  const missing = call.requiredDocuments.filter(
    (d) =>
      d.required && !application?.attachments.some((a) => a.docKey === d.key),
  );

  return (
    <div className="mt-6 space-y-6">
      <form onSubmit={onSave} noValidate className={`${CARD} grid gap-4`}>
        <h2 className="font-display text-xl">{t('stepProject')}</h2>
        <TextField
          label={t('fieldTitle')}
          id="ca-title"
          required
          maxLength={PROGRAMME_LIMITS.shortText}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <TextareaField
          label={t('fieldSummary')}
          id="ca-summary"
          rows={6}
          required
          maxLength={FIELD_MAX.body}
          hint={
            <span className="wrap-anywhere">
              {t('charCount', { count: summary.length, max: FIELD_MAX.body })}
            </span>
          }
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
        <SelectField
          label={t('fieldLanguage')}
          id="ca-language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          {call.languages.map((l) => (
            <option key={l} value={l}>
              {vocabulary(tl, 'langs.', l)}
            </option>
          ))}
        </SelectField>
        <FormError>{error}</FormError>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {t('saveDraft')}
          </Button>
          {status ? (
            <span role="status" className="text-sm text-accent-text">
              {status}
            </span>
          ) : null}
        </div>
      </form>

      {application ? (
        <>
          <section className={CARD} aria-labelledby="ca-docs-h">
            <h2 id="ca-docs-h" className="font-display text-xl">
              {t('stepDocuments')}
            </h2>
            <p className="mt-1 text-[13px] text-muted">
              {t('documentsFormats')}
            </p>
            <ul className="mt-4 space-y-4">
              {call.requiredDocuments.map((d) => (
                <DocumentSlot
                  key={d.key}
                  applicationId={application._id}
                  doc={d}
                  attachment={
                    application.attachments.find((a) => a.docKey === d.key) ??
                    null
                  }
                />
              ))}
            </ul>
          </section>
          <section className={CARD} aria-labelledby="ca-submit-h">
            <h2 id="ca-submit-h" className="font-display text-xl">
              {t('stepSubmit')}
            </h2>
            <p className="mt-1 text-[14px] text-ink-soft">
              {t('submitWarning')}
            </p>
            {missing.length ? (
              <p className="mt-2 text-[14px] text-bar-5">
                {t('missingDocs', {
                  list: missing.map((d) => d.label).join(', '),
                })}
              </p>
            ) : null}
            <Button
              className="mt-3 min-h-11"
              disabled={missing.length > 0 || pending}
              onClick={async () => {
                setError(null);
                setPending(true);
                try {
                  await submit({ applicationId: application._id });
                } catch (err) {
                  setError(errorMessage(err));
                } finally {
                  setPending(false);
                }
              }}
            >
              {t('submitApplication')}
            </Button>
          </section>
        </>
      ) : (
        <p className="text-[14px] text-ink-soft">{t('saveFirst')}</p>
      )}
    </div>
  );
}

function DocumentSlot({
  applicationId,
  doc,
  attachment,
}: {
  applicationId: Id<'projectCallApplications'>;
  doc: { key: string; label: string; required: boolean };
  attachment: MyApplication['attachments'][number] | null;
}) {
  const t = useTranslations('projects');
  const generate = useMutation(api.projectCalls.generateAttachmentUploadUrl);
  const attach = useAction(api.projectCalls.attachDocument);
  const remove = useMutation(api.projectCalls.removeAttachment);
  const errorMessage = useProgrammeError();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputId = `doc-${doc.key}`;

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > PROGRAMME_LIMITS.maxFileBytes)
      return setError(t('fileTooLarge'));
    setProgress(0);
    try {
      const url = await generate();
      const { storageId } = await uploadWithProgress<{
        storageId: Id<'_storage'>;
      }>({
        url,
        file,
        contentType: file.type || 'application/octet-stream',
        onProgress: (p) => setProgress(p.percent ?? 0),
      });
      await attach({
        applicationId,
        docKey: doc.key,
        storageId,
        fileName: file.name,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setProgress(null);
    }
  }

  return (
    <li className="rounded-sm border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="wrap-anywhere font-medium text-ink">{doc.label}</span>
        <span className="text-[12px] text-muted">
          {doc.required ? t('docRequired') : t('docOptional')}
        </span>
      </div>
      {attachment ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[14px]">
          <span className="wrap-anywhere text-ink-soft">
            {t('attachedFile', {
              name: attachment.fileName,
              size: Math.max(1, Math.round(attachment.size / 1024)),
            })}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="min-h-11"
            onClick={async () => {
              setError(null);
              try {
                await remove({ attachmentId: attachment._id });
              } catch (err) {
                setError(errorMessage(err));
              }
            }}
          >
            {t('removeFile')}
          </Button>
        </div>
      ) : null}
      <Field
        className="mt-2"
        id={inputId}
        label={attachment ? t('replaceFile') : t('chooseFile')}
      >
        {(control) => (
          <input
            {...control}
            type="file"
            accept={ACCEPT}
            className="block min-h-11 w-full text-sm text-ink-soft file:me-3 file:min-h-11 file:rounded-sm file:border file:border-line-strong file:bg-surface-2 file:px-3 file:text-ink"
            disabled={progress !== null}
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        )}
      </Field>
      {progress !== null ? (
        <p role="status" className="mt-1 text-[13px] text-muted">
          {t('uploading', { pct: progress })}
        </p>
      ) : null}
      <FormError className="mt-1">{error}</FormError>
    </li>
  );
}
