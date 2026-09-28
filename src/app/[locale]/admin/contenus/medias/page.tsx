'use client';

import { useRef, useState, type FormEvent } from 'react';
import Image from 'next/image';
import { useAction, useMutation, useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import type { SiteLocale } from '@convex/lib/locales';
import { resolveLocale } from '@/i18n/locale';
import { uploadWithProgress } from '@/lib/upload';
import { Button } from '@/components/ui/button';
import { Field, FormError, TextField } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  LangSwitch,
  LocalizedInput,
  missingIn,
  MissingLangs,
  type LText,
} from '@/components/admin/contenus/localized';
import {
  ConfirmButton,
  useRunAction,
} from '@/components/admin/contenus/editor-shell';
import {
  useActionFeedback,
  useFailureFeedback,
} from '@/components/admin/action-feedback';

// MEDIA LIBRARY (F-64) — upload, describe, search, reuse.
//
// The file goes DIRECTLY into Convex storage (signed upload URL),
// then `finalizeUpload` re-reads its actual content: a file whose bytes
// are neither an image nor a PDF is rejected AND deleted. Alt text is
// required at upload (at least one language) — without it, the button stays disabled and
// the server refuses anyway. A media item used by a piece of content cannot be
// deleted: the list says what uses it.

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,application/pdf';

export default function AdminContentMedia() {
  const t = useTranslations('contentAdmin');
  const loc = resolveLocale(useLocale());
  const [search, setSearch] = useState('');
  const rows = useQuery(api.contenus.media.list, {
    locale: loc,
    search: search || undefined,
  });
  const remove = useMutation(api.contenus.media.remove);
  const { run } = useRunAction();

  const kb = (bytes: number) => Math.max(1, Math.round(bytes / 1024));
  const usageLabel = (u: {
    kind: 'event' | 'partner' | 'replay';
    slug: string;
  }) =>
    u.kind === 'event'
      ? t('md_usage_event', { slug: u.slug })
      : u.kind === 'partner'
        ? t('md_usage_partner', { slug: u.slug })
        : t('md_usage_replay', { slug: u.slug });

  return (
    <div>
      <h1 className="font-display text-3xl">{t('tab_media')}</h1>
      <UploadForm />

      <div className="mt-8 max-w-md">
        <TextField
          label={t('md_search')}
          type="search"
          value={search}
          placeholder={t('md_searchPlaceholder')}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {rows === undefined ? (
        <p className="mt-6 text-ink-soft">{t('loading')}</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-ink-soft">{t('md_empty')}</p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {rows.map((m) => (
            <li
              key={m._id}
              className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4"
            >
              <div className="flex items-start gap-3">
                {m.kind === 'image' && m.url ? (
                  <Image
                    src={m.url}
                    alt={m.altText}
                    width={m.width ?? 96}
                    height={m.height ?? 64}
                    unoptimized
                    className="h-16 w-24 shrink-0 rounded-sm bg-paper object-contain"
                  />
                ) : (
                  <span className="grid h-16 w-24 shrink-0 place-items-center rounded-sm border border-line bg-paper font-mono text-[11px] text-muted">
                    PDF
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink wrap-anywhere">
                    {m.filename}
                  </p>
                  <p className="text-[12px] text-muted">
                    {m.kind === 'pdf'
                      ? t('md_pdf')
                      : t('md_dimensions', {
                          w: m.width ?? 0,
                          h: m.height ?? 0,
                        })}{' '}
                    · {t('md_size', { size: kb(m.size) })}
                  </p>
                  <p className="mt-1 text-[13px] text-ink-soft wrap-anywhere">
                    {m.altText}
                  </p>
                  <MissingLangs missing={m.missing} />
                </div>
              </div>
              <p className="text-[12px] text-ink-soft wrap-anywhere">
                {m.usage.length
                  ? t('md_usedBy', { list: m.usage.map(usageLabel).join(', ') })
                  : t('md_unused')}
              </p>
              <div className="flex flex-wrap gap-1">
                <AltEditor id={m._id} initial={m.alt} />
                {m.usage.length === 0 ? (
                  <ConfirmButton
                    label={t('delete')}
                    title={t('md_confirmDelete', { name: m.filename })}
                    description={t('confirmDeleteBody')}
                    confirmLabel={t('delete')}
                    onConfirm={() =>
                      run(
                        () => remove({ id: m._id }),
                        t('deletedMsg', { title: m.filename }),
                      )
                    }
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UploadForm() {
  const t = useTranslations('contentAdmin');
  const notify = useActionFeedback();
  const fail = useFailureFeedback();
  const generateUploadUrl = useMutation(api.contenus.media.generateUploadUrl);
  const finalize = useAction(api.contenus.media.finalizeUpload);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState<LText>({});
  const [lang, setLang] = useState<SiteLocale>('fr');
  const [percent, setPercent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = percent !== null;
  const missing = missingIn([alt]);
  const hasAlt = missing.length < 5;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError(t('md_fileRequired'));
      return;
    }
    setPercent(0);
    try {
      const url = await generateUploadUrl({});
      const { storageId } = await uploadWithProgress<{
        storageId: Id<'_storage'>;
      }>({
        url,
        file,
        contentType: file.type || 'application/octet-stream',
        onProgress: (p) => setPercent(p.percent ?? 0),
      });
      await finalize({ storageId, filename: file.name, alt });
      notify(t('md_uploaded', { name: file.name }));
      setFile(null);
      setAlt({});
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      // Server refusal (actual type, size, alt text): message translated
      // from its code; network failure: invitation to retry.
      fail(err);
      setError(t('md_uploadFailed'));
    } finally {
      setPercent(null);
    }
  }

  return (
    <section
      aria-labelledby="media-upload-title"
      className="mt-6 rounded-md border border-line bg-surface p-5"
    >
      <h2 id="media-upload-title" className="font-display text-xl">
        {t('md_upload')}
      </h2>
      <form onSubmit={onSubmit} className="mt-4 grid gap-4">
        <Field label={t('md_file')} hint={t('md_fileHint')}>
          {(control) => (
            <Input
              {...control}
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              required
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          )}
        </Field>
        <LangSwitch value={lang} onChange={setLang} missing={missing} />
        <LocalizedInput
          label={t('md_alt')}
          hint={t('md_altHint')}
          value={alt}
          onChange={setAlt}
          lang={lang}
          required
          maxLength={300}
        />
        <FormError>{error}</FormError>
        <div>
          <Button type="submit" className="min-h-11" disabled={busy || !hasAlt}>
            {busy ? t('md_uploading', { percent: percent ?? 0 }) : t('md_send')}
          </Button>
        </div>
      </form>
    </section>
  );
}

function AltEditor({
  id,
  initial,
}: {
  id: Id<'contentMedia'>;
  initial: LText;
}) {
  const t = useTranslations('contentAdmin');
  const updateAlt = useMutation(api.contenus.media.updateAlt);
  const { run, pending } = useRunAction();
  const [open, setOpen] = useState(false);
  const [alt, setAlt] = useState<LText>(initial);
  const [lang, setLang] = useState<SiteLocale>('fr');
  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="min-h-11"
        aria-expanded={false}
        onClick={() => {
          setAlt(initial);
          setOpen(true);
        }}
      >
        {t('md_editAlt')}
      </Button>
    );
  }
  return (
    <form
      className="grid w-full gap-3 rounded-sm border border-line bg-paper p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run(() => updateAlt({ id, alt }), t('md_altSaved'));
        if (ok !== undefined) setOpen(false);
      }}
    >
      <LangSwitch value={lang} onChange={setLang} missing={missingIn([alt])} />
      <LocalizedInput
        label={t('md_alt')}
        value={alt}
        onChange={setAlt}
        lang={lang}
        required
        maxLength={300}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" className="min-h-11" disabled={pending}>
          {t('save')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11"
          onClick={() => setOpen(false)}
        >
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}
