'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import type { SiteLocale } from '@convex/lib/locales';
import { resolveLocale } from '@/i18n/locale';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import {
  LangSwitch,
  LocalizedInput,
  LocalizedListInput,
  MissingLangs,
  StatusBadge,
  missingIn,
  previewText,
  useLangName,
  type LList,
  type LText,
} from '@/components/admin/contenus/localized';
import {
  ConfirmButton,
  EditorShell,
  PreviewCard,
  useRunAction,
} from '@/components/admin/contenus/editor-shell';

// NEWS — EDITING (F-15, F-62). One article carries its five languages: a
// title, an optional standfirst and a text in paragraphs, plus its
// publication day. The slug is the public address: set at creation, never
// modified afterwards (a shared link does not break).

type Draft = {
  slug: string;
  title: LText;
  excerpt: LText;
  body: LList;
  publishedOn: string;
};

const today = () => new Date().toISOString().slice(0, 10);

const empty = (): Draft => ({
  slug: '',
  title: {},
  excerpt: {},
  body: {},
  publishedOn: today(),
});

export default function AdminContentNews() {
  const t = useTranslations('contentAdmin');
  const loc = resolveLocale(useLocale());
  const langName = useLangName();
  const rows = useQuery(api.contenus.news.adminList, { locale: loc });
  const save = useMutation(api.contenus.news.save);
  const setStatus = useMutation(api.contenus.news.setStatus);
  const remove = useMutation(api.contenus.news.remove);
  const { run, pending } = useRunAction();

  const [editing, setEditing] = useState<Id<'contentNews'> | 'new' | null>(
    null,
  );
  const [draft, setDraft] = useState<Draft>(empty);
  const [lang, setLang] = useState<SiteLocale>('fr');
  // The list carries no text: the article is read in full when opened.
  const current = useQuery(
    api.contenus.news.adminGet,
    editing && editing !== 'new' ? { id: editing } : 'skip',
  );
  useEffect(() => {
    if (!current) return;
    setDraft({
      slug: current.slug,
      title: current.title,
      excerpt: current.excerpt,
      body: current.body,
      publishedOn: current.publishedOn,
    });
  }, [current]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  function open(id: Id<'contentNews'> | 'new') {
    setEditing(id);
    setLang('fr');
    if (id === 'new') setDraft(empty());
  }

  async function submit() {
    const title = previewText(draft.title, loc).text || draft.slug;
    const id = await run(
      () =>
        save({
          ...(editing && editing !== 'new'
            ? { id: editing }
            : { slug: draft.slug.trim() }),
          title: draft.title,
          excerpt: draft.excerpt,
          body: draft.body,
          publishedOn: draft.publishedOn,
        }),
      t('saved', { title }),
    );
    if (id) setEditing(null);
  }

  const title = previewText(draft.title, lang);
  const excerpt = previewText(draft.excerpt, lang);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">{t('tab_news')}</h1>
        <Button type="button" className="min-h-11" onClick={() => open('new')}>
          {t('nw_new')}
        </Button>
      </div>

      {editing ? (
        <EditorShell
          title={
            editing === 'new'
              ? t('nw_new')
              : t('editItem', { title: previewText(draft.title, loc).text })
          }
          onSubmit={submit}
          onClose={() => setEditing(null)}
          pending={pending}
          aside={
            <PreviewCard
              heading={t('preview', { lang: langName(lang) })}
              fallback={title.fallback || excerpt.fallback}
            >
              <div lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                <p className="font-display text-lg leading-snug wrap-anywhere">
                  {title.text || '—'}
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-soft wrap-anywhere">
                  {excerpt.text}
                </p>
              </div>
            </PreviewCard>
          }
        >
          {editing === 'new' ? (
            <TextField
              label={t('slug')}
              hint={t('slugHint')}
              value={draft.slug}
              onChange={(e) => set('slug', e.target.value)}
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              maxLength={100}
            />
          ) : (
            <p className="font-mono text-[12px] text-muted wrap-anywhere">
              {t('slugFixed', { slug: draft.slug })}
            </p>
          )}
          <TextField
            label={t('nw_date')}
            type="date"
            value={draft.publishedOn}
            onChange={(e) => set('publishedOn', e.target.value)}
            required
          />
          <LangSwitch
            value={lang}
            onChange={setLang}
            missing={missingIn([draft.title, draft.body])}
          />
          <LocalizedInput
            label={t('nw_title')}
            value={draft.title}
            onChange={(v) => set('title', v)}
            lang={lang}
            required
            maxLength={200}
          />
          <LocalizedInput
            label={t('nw_excerpt')}
            value={draft.excerpt}
            onChange={(v) => set('excerpt', v)}
            lang={lang}
            multiline
            maxLength={400}
          />
          <LocalizedListInput
            // Key per ENTRY: the raw input draft restarts from the
            // saved value when switching articles.
            key={`body-${editing}`}
            label={t('nw_body')}
            hint={t('nw_bodyHint')}
            value={draft.body}
            onChange={(v) => set('body', v)}
            lang={lang}
            separator="paragraph"
          />
        </EditorShell>
      ) : null}

      {rows === undefined ? (
        <p className="mt-6 text-ink-soft">{t('loading')}</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-ink-soft">{t('empty')}</p>
      ) : (
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-md border border-line">
          {rows.map((r) => (
            <li
              key={r._id}
              className="flex flex-wrap items-center gap-3 bg-surface px-4 py-3"
            >
              <span className="min-w-[12rem] flex-1">
                <span className="block font-medium text-ink wrap-anywhere">
                  {r.title}
                </span>
                <span className="font-mono text-[11px] text-muted">
                  {r.publishedOn}
                </span>{' '}
                <MissingLangs missing={r.missing} />
              </span>
              <StatusBadge status={r.status} />
              <div className="flex flex-wrap gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11"
                  aria-label={t('editItem', { title: r.title })}
                  onClick={() => open(r._id)}
                >
                  {t('edit')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11"
                  onClick={() =>
                    r.status === 'published'
                      ? run(
                          () => setStatus({ id: r._id, status: 'draft' }),
                          t('unpublishedMsg', { title: r.title }),
                        )
                      : run(
                          () => setStatus({ id: r._id, status: 'published' }),
                          t('publishedMsg', { title: r.title }),
                        )
                  }
                >
                  {r.status === 'published' ? t('unpublish') : t('publish')}
                </Button>
                <ConfirmButton
                  label={t('delete')}
                  title={t('confirmDelete', { title: r.title })}
                  description={t('confirmDeleteBody')}
                  confirmLabel={t('delete')}
                  onConfirm={() =>
                    run(
                      () => remove({ id: r._id }),
                      t('deletedMsg', { title: r.title }),
                    )
                  }
                />
                {r.status === 'published' ? (
                  <Link
                    href={`/actualites/${r.slug}`}
                    className="inline-flex min-h-11 items-center px-3 text-xs font-medium text-accent-text hover:underline"
                  >
                    {t('ev_viewPublic')}
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
