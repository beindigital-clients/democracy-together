'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import type { FunctionReturnType } from 'convex/server';
import { MANUSCRIPT_BOUNDS } from '@convex/lib/manuscripts';
import { AuthGate, AuthGateLoading } from '@/components/auth/auth-gate';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Field,
  FormError,
  TextField,
  TextareaField,
} from '@/components/ui/field';
import { ProgressBar } from '@/components/ui/progress-bar';
import { UPLOAD_FAILED, uploadWithProgress } from '@/lib/upload';
import { isMember } from '@/lib/roles';
import { vocabulary } from '@/i18n/vocabulary';
import { intlLocale } from '@/i18n/locale';

type Manuscript = FunctionReturnType<
  typeof api.peerReview.myManuscripts
>['manuscripts'][number];

const MAX_FILE_MB = 20;

function useDateFormat() {
  const locale = useLocale();
  const fmt = new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return (ms: number) => fmt.format(ms);
}

// Refus serveur que l'auteur peut rencontrer ici — liste FERMÉE : un code
// inconnu retombe sur le message générique, jamais sur une clé brute.
const AUTHOR_ERROR_CODES = [
  'INVALID_FILE',
  'INVALID_TITLE',
  'INVALID_ABSTRACT',
  'INVALID_RESPONSE_LETTER',
  'INVALID_TRANSITION',
  'ALREADY_REVIEWED',
  'NOT_FOUND',
  'RATE_LIMITED',
] as const;

function useErrorMessage() {
  const t = useTranslations('peerReview');
  return (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    if (message === UPLOAD_FAILED) return t('err_UPLOAD');
    const data =
      err && typeof err === 'object' && 'data' in err ? String(err.data) : '';
    const code = AUTHOR_ERROR_CODES.find(
      (c) =>
        data === c || new RegExp(`(^|[^A-Z_])${c}([^A-Z_]|$)`).test(message),
    );
    return code ? vocabulary(t, 'err_', code) : t('err_GENERIC');
  };
}

// RÉVISION — nouvelle version du manuscrit : fichier, métadonnées corrigées et
// lettre de réponse aux relecteurs (obligatoire). Le fichier est anonymisé
// côté serveur avant d'être transmis ; le texte, lui, relève de l'auteur.
function RevisionForm({
  publicationId,
}: {
  publicationId: Id<'publications'>;
}) {
  const t = useTranslations('peerReview');
  const context = useQuery(api.peerReview.myRevisionContext, { publicationId });
  const generateUploadUrl = useMutation(api.publications.generateUploadUrl);
  const submitRevision = useMutation(api.peerReview.submitRevision);
  const errorMessage = useErrorMessage();
  const fileRef = useRef<HTMLInputElement>(null);
  const [edited, setEdited] = useState<{
    title?: string;
    abstract?: string;
    keywords?: string;
  }>({});
  const [letter, setLetter] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'sending'>(
    'idle',
  );
  const [error, setError] = useState('');
  const [done, setDone] = useState<number | null>(null);

  if (context === undefined) return null;
  if (context === null) return null;
  const title = edited.title ?? context.title;
  const abstract = edited.abstract ?? context.abstract;
  const keywords = edited.keywords ?? context.keywords.join(', ');
  const B = MANUSCRIPT_BOUNDS;

  if (done !== null) {
    return (
      <p
        role="status"
        className="mt-4 rounded border border-line bg-surface-2 p-4 text-sm text-ink"
      >
        {t('revisionSent', { version: done })}
      </p>
    );
  }

  async function submit() {
    setError('');
    if (!file) {
      setError(t('err_FILE_REQUIRED'));
      fileRef.current?.focus();
      return;
    }
    if (
      file.size > MAX_FILE_MB * 1024 * 1024 ||
      !/pdf$/i.test(file.type || file.name)
    ) {
      setError(t('err_INVALID_FILE'));
      fileRef.current?.focus();
      return;
    }
    try {
      setStatus('uploading');
      setPercent(null);
      const url = await generateUploadUrl();
      const json = await uploadWithProgress<{ storageId: Id<'_storage'> }>({
        url,
        file,
        contentType: file.type || 'application/pdf',
        onProgress: (p) => setPercent(p.percent),
      });
      setStatus('sending');
      const res = await submitRevision({
        publicationId,
        title: title.trim(),
        abstract: abstract.trim(),
        keywords: keywords
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean),
        fileId: json.storageId,
        fileName: file.name,
        responseLetter: letter.trim(),
      });
      setDone(res.version);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setStatus('idle');
      setPercent(null);
    }
  }

  const busy = status !== 'idle';
  return (
    <div className="mt-4 rounded border border-accent-edge bg-accent-tint p-4">
      <h3 className="font-display text-lg text-ink">
        {t('revisionTitle', { version: context.version + 1 })}
      </h3>
      <p className="mt-1 text-sm text-ink-soft">{t('blindAdvice')}</p>
      <div className="mt-3 space-y-3">
        <TextField
          label={t('fieldTitle')}
          value={title}
          maxLength={B.title.max}
          onChange={(e) => setEdited((s) => ({ ...s, title: e.target.value }))}
        />
        <TextareaField
          label={t('fieldAbstract')}
          rows={5}
          value={abstract}
          maxLength={B.abstract.max}
          onChange={(e) =>
            setEdited((s) => ({ ...s, abstract: e.target.value }))
          }
        />
        <TextField
          label={t('fieldKeywords')}
          hint={t('fieldKeywordsHint')}
          value={keywords}
          onChange={(e) =>
            setEdited((s) => ({ ...s, keywords: e.target.value }))
          }
        />
        {/* Champ fichier : contrôle particulier, rendu par la coquille du
            système de champs (libellé, aide et erreur rattachés). */}
        <Field
          label={t('fieldFile')}
          hint={
            file
              ? t('fileSelected', { name: file.name })
              : t('fieldFileHint', { max: MAX_FILE_MB })
          }
        >
          {(control) => (
            <input
              {...control}
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block min-h-11 w-full text-sm text-ink-soft file:me-3 file:cursor-pointer file:rounded-sm file:border file:border-line-strong file:bg-surface-2 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-line"
            />
          )}
        </Field>
        <TextareaField
          label={t('fieldResponseLetter')}
          hint={t('fieldResponseLetterHint', { min: B.responseLetter.min })}
          rows={7}
          value={letter}
          maxLength={B.responseLetter.max}
          onChange={(e) => setLetter(e.target.value)}
        />
        {status === 'uploading' ? (
          <ProgressBar
            label={t('uploading')}
            percent={percent}
            text={
              percent === null
                ? t('uploading')
                : t('uploadPercent', { percent })
            }
          />
        ) : null}
        <FormError>{error}</FormError>
        <Button
          disabled={
            busy ||
            letter.trim().length < B.responseLetter.min ||
            title.trim().length < B.title.min ||
            abstract.trim().length < B.abstract.min
          }
          onClick={submit}
        >
          {busy ? t('sending') : t('revisionSubmit')}
        </Button>
      </div>
    </div>
  );
}

function ManuscriptCard({ m }: { m: Manuscript }) {
  const t = useTranslations('peerReview');
  const ta = useTranslations('library');
  const fmt = useDateFormat();
  return (
    <li className="rounded-md border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 wrap-anywhere font-medium text-ink">
          {m.title}
        </h3>
        <Badge variant="accent">{vocabulary(t, 'stage_', m.reviewStage)}</Badge>
        <Badge variant="outline">
          {t('versionLabel', { version: m.currentVersion })}
        </Badge>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        {vocabulary(t, 'authorStage_', m.reviewStage)}
      </p>
      {m.status === 'published' && m.reviewStage === 'accepted' ? (
        <Link
          href={`/bibliotheque/${m.slug}`}
          className="mt-2 inline-block py-1 text-sm font-medium text-accent-text hover:underline"
        >
          {ta('mine.open')}
        </Link>
      ) : null}

      <h4 className="mt-4 text-sm font-medium text-ink-soft">
        {t('versionsTitle')}
      </h4>
      <ol className="mt-2 space-y-1 text-sm">
        {m.versions.map((v) => (
          <li key={v.version} className="wrap-anywhere text-ink">
            {t('versionLabel', { version: v.version })} — {v.title}{' '}
            <span className="text-muted">
              ({t('submittedOn', { date: fmt(v.createdAt) })}
              {v.hasResponseLetter ? ` · ${t('withResponseLetter')}` : ''})
            </span>
          </li>
        ))}
      </ol>

      {m.decisions.length > 0 ? (
        <>
          <h4 className="mt-4 text-sm font-medium text-ink-soft">
            {t('decisionsTitle')}
          </h4>
          <ul className="mt-2 space-y-2">
            {m.decisions.map((d, i) => (
              <li
                key={i}
                className="rounded border border-line bg-surface-2 p-3 text-sm"
              >
                <p className="font-medium text-ink">
                  {t('versionLabel', { version: d.version })} ·{' '}
                  {vocabulary(t, 'decision_', d.decision)} · {fmt(d.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-line wrap-anywhere text-ink">
                  {d.reason}
                </p>
                {/* Avis de ce tour, NUMÉROTÉS : jamais le nom d'un relecteur. */}
                {m.reviews.filter((r) => r.version === d.version).length > 0 ? (
                  <ul className="mt-3 space-y-2 border-t border-line pt-3">
                    {m.reviews
                      .filter((r) => r.version === d.version)
                      .map((r) => (
                        <li key={`${r.version}-${r.index}`}>
                          <p className="font-medium text-ink-soft">
                            {t('reviewerN', { n: r.index })} ·{' '}
                            {vocabulary(t, 'rec_', r.recommendation)}
                          </p>
                          <p className="mt-1 whitespace-pre-line wrap-anywhere text-ink">
                            {r.comment}
                          </p>
                        </li>
                      ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {m.canRevise ? <RevisionForm publicationId={m.publicationId} /> : null}
    </li>
  );
}

function SubmitDeposit({
  publicationId,
  title,
}: {
  publicationId: Id<'publications'>;
  title: string;
}) {
  const t = useTranslations('peerReview');
  const submit = useMutation(api.peerReview.submitManuscript);
  const errorMessage = useErrorMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface p-4">
      <span className="min-w-0 wrap-anywhere font-medium text-ink">
        {title}
      </span>
      <div>
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await submit({ publicationId });
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t('submitToCommittee')}
        </Button>
        <FormError className="mt-1">{error}</FormError>
      </div>
    </li>
  );
}

function ManuscriptsPage() {
  const t = useTranslations('peerReview');
  const ta = useTranslations('auth');
  const me = useQuery(api.users.current);
  const data = useQuery(
    api.peerReview.myManuscripts,
    me && isMember(me.role) ? {} : 'skip',
  );
  if (me === undefined) return <AuthGateLoading className="max-w-3xl" />;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="text-[13px] text-muted">
        <Link href="/espace-membre" className="text-muted hover:text-ink">
          {ta('memberTitle')}
        </Link>{' '}
        / {t('authorTitle')}
      </p>
      <h1 className="mt-4 font-display text-3xl">{t('authorTitle')}</h1>
      <p className="mt-2 max-w-[62ch] text-ink-soft">{t('authorIntro')}</p>
      <p className="mt-2 max-w-[62ch] text-sm text-muted">{t('blindAdvice')}</p>

      {!isMember(me?.role) ? (
        <p className="mt-8 rounded-md border border-accent-edge bg-accent-tint p-6 text-ink-soft">
          {t('membersOnly')}
        </p>
      ) : data === undefined ? (
        <p className="mt-8 text-ink-soft">{t('loading')}</p>
      ) : (
        <>
          <section aria-labelledby="manuscripts-eligible" className="mt-8">
            <h2 id="manuscripts-eligible" className="font-display text-2xl">
              {t('eligibleTitle')}
            </h2>
            {data.eligible.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">
                {t('eligibleEmpty')}{' '}
                <Link
                  href="/espace-membre/deposer"
                  className="inline-block py-1 font-medium text-accent-text hover:underline"
                >
                  {t('depositLink')}
                </Link>
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {data.eligible.map((p) => (
                  <SubmitDeposit
                    key={p.publicationId}
                    publicationId={p.publicationId}
                    title={p.title}
                  />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="manuscripts-mine" className="mt-10">
            <h2 id="manuscripts-mine" className="font-display text-2xl">
              {t('mineTitle')}
            </h2>
            {data.manuscripts.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">{t('mineEmpty')}</p>
            ) : (
              <ul className="mt-3 space-y-4">
                {data.manuscripts.map((m) => (
                  <ManuscriptCard key={m.publicationId} m={m} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// SUIVI DE L'AUTEUR (F-43) — ses manuscrits en revue à comité de lecture :
// étape, versions, décisions motivées et avis NUMÉROTÉS (jamais le nom d'un
// relecteur), révision à déposer quand elle est demandée ; et les dépôts
// qu'il peut encore soumettre au comité.
export default function ManuscriptsRoute() {
  return (
    <AuthGate className="max-w-md">
      <ManuscriptsPage />
    </AuthGate>
  );
}
