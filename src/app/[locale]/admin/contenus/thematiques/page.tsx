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
  EditorShell,
  PreviewCard,
  useRunAction,
} from '@/components/admin/contenus/editor-shell';

// THEMES — EDITING (F-36, F-62). Translated titles and summaries, order.
// The slug is the key that links publications, Tribune, calls for projects and
// barometer to an axis: it is NEVER modified, and a theme is not
// deleted (it is unpublished).

type Draft = {
  slug: string;
  title: LText;
  lead: LText;
  stance: LList;
  questions: LList;
  dimension: string;
};

const EMPTY: Draft = {
  slug: '',
  title: {},
  lead: {},
  stance: {},
  questions: {},
  dimension: '',
};

export default function AdminContentThemes() {
  const t = useTranslations('contentAdmin');
  const loc = resolveLocale(useLocale());
  const langName = useLangName();
  const rows = useQuery(api.contenus.themes.adminList, { locale: loc });
  const save = useMutation(api.contenus.themes.save);
  const setStatus = useMutation(api.contenus.themes.setStatus);
  const move = useMutation(api.contenus.themes.move);
  const { run, pending } = useRunAction();

  const [editing, setEditing] = useState<Id<'contentThemes'> | 'new' | null>(
    null,
  );
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [lang, setLang] = useState<SiteLocale>('fr');
  const current = useQuery(
    api.contenus.themes.adminGet,
    editing && editing !== 'new' ? { id: editing } : 'skip',
  );
  useEffect(() => {
    if (!current) return;
    setDraft({
      slug: current.slug,
      title: current.title,
      lead: current.lead,
      stance: current.stance,
      questions: current.questions,
      dimension: current.dimension ?? '',
    });
  }, [current]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  function open(id: Id<'contentThemes'> | 'new') {
    setEditing(id);
    setLang('fr');
    if (id === 'new') setDraft(EMPTY);
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
          lead: draft.lead,
          stance: draft.stance,
          questions: draft.questions,
          dimension: draft.dimension.trim() || undefined,
        }),
      t('saved', { title }),
    );
    if (id) setEditing(null);
  }

  const title = previewText(draft.title, lang);
  const lead = previewText(draft.lead, lang);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">{t('tab_themes')}</h1>
        <Button type="button" className="min-h-11" onClick={() => open('new')}>
          {t('th_new')}
        </Button>
      </div>

      {editing ? (
        <EditorShell
          title={
            editing === 'new'
              ? t('th_new')
              : t('editItem', { title: previewText(draft.title, loc).text })
          }
          onSubmit={submit}
          onClose={() => setEditing(null)}
          pending={pending}
          aside={
            <PreviewCard
              heading={t('preview', { lang: langName(lang) })}
              fallback={title.fallback || lead.fallback}
            >
              <div lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                <p className="font-display text-lg leading-snug wrap-anywhere">
                  {title.text || '—'}
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-soft wrap-anywhere">
                  {lead.text}
                </p>
              </div>
            </PreviewCard>
          }
        >
          {editing === 'new' ? (
            <TextField
              label={t('slug')}
              hint={t('th_slugHint')}
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
          <LangSwitch
            value={lang}
            onChange={setLang}
            missing={missingIn([draft.title, draft.lead])}
          />
          <LocalizedInput
            label={t('th_title')}
            value={draft.title}
            onChange={(v) => set('title', v)}
            lang={lang}
            required
            maxLength={200}
          />
          <LocalizedInput
            label={t('th_lead')}
            value={draft.lead}
            onChange={(v) => set('lead', v)}
            lang={lang}
            multiline
            maxLength={4000}
          />
          <LocalizedListInput
            // Key per ENTRY: the raw input draft restarts from the
            // saved value when switching themes.
            key={`stance-${editing}`}
            label={t('th_stance')}
            hint={t('th_stanceHint')}
            value={draft.stance}
            onChange={(v) => set('stance', v)}
            lang={lang}
            separator="paragraph"
          />
          <LocalizedListInput
            key={`questions-${editing}`}
            label={t('th_questions')}
            hint={t('th_questionsHint')}
            value={draft.questions}
            onChange={(v) => set('questions', v)}
            lang={lang}
            separator="line"
          />
          <TextField
            label={t('th_dimension')}
            value={draft.dimension}
            onChange={(e) => set('dimension', e.target.value)}
            maxLength={20}
          />
        </EditorShell>
      ) : null}

      {rows === undefined ? (
        <p className="mt-6 text-ink-soft">{t('loading')}</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-ink-soft">{t('empty')}</p>
      ) : (
        <ol className="mt-6 divide-y divide-line overflow-hidden rounded-md border border-line">
          {rows.map((r, i) => (
            <li
              key={r._id}
              className="flex flex-wrap items-center gap-3 bg-surface px-4 py-3"
            >
              <span className="w-8 font-mono text-[12px] text-muted">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="min-w-[12rem] flex-1">
                <span className="block font-medium text-ink wrap-anywhere">
                  {r.title}
                </span>
                <MissingLangs missing={r.missing} />
              </span>
              <StatusBadge status={r.status} />
              <div className="flex flex-wrap gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11"
                  disabled={i === 0}
                  aria-label={t('moveUp', { title: r.title })}
                  onClick={() =>
                    run(
                      () => move({ id: r._id, direction: 'up' }),
                      t('movedMsg'),
                    )
                  }
                >
                  <span aria-hidden="true">↑</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11"
                  disabled={i === rows.length - 1}
                  aria-label={t('moveDown', { title: r.title })}
                  onClick={() =>
                    run(
                      () => move({ id: r._id, direction: 'down' }),
                      t('movedMsg'),
                    )
                  }
                >
                  <span aria-hidden="true">↓</span>
                </Button>
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
                {r.status === 'published' ? (
                  <Link
                    href={`/thematiques/${r.slug}`}
                    className="inline-flex min-h-11 items-center px-3 text-xs font-medium text-accent-text hover:underline"
                  >
                    {t('ev_viewPublic')}
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
