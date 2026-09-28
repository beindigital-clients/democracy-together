'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import type { SiteLocale } from '@convex/lib/locales';
import { resolveLocale } from '@/i18n/locale';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import {
  LangSwitch,
  LocalizedInput,
  MissingLangs,
  StatusBadge,
  missingIn,
  previewText,
  useLangName,
  type LText,
} from '@/components/admin/contenus/localized';
import { MediaPicker } from '@/components/admin/contenus/media-picker';
import {
  ConfirmButton,
  EditorShell,
  PreviewCard,
  useRunAction,
} from '@/components/admin/contenus/editor-shell';

// PARTNERS — EDITING (F-14, F-62). Name and translated texts, logo chosen from
// the media library (F-64), link, display order (move up / move down).

type Draft = {
  slug: string;
  name: LText;
  kicker: LText;
  summary: LText;
  gives: LText;
  gets: LText;
  logoMediaId: Id<'contentMedia'> | undefined;
  url: string;
};

const EMPTY: Draft = {
  slug: '',
  name: {},
  kicker: {},
  summary: {},
  gives: {},
  gets: {},
  logoMediaId: undefined,
  url: '',
};

export default function AdminContentPartners() {
  const t = useTranslations('contentAdmin');
  const loc = resolveLocale(useLocale());
  const langName = useLangName();
  const rows = useQuery(api.contenus.partners.adminList, { locale: loc });
  const save = useMutation(api.contenus.partners.save);
  const setStatus = useMutation(api.contenus.partners.setStatus);
  const move = useMutation(api.contenus.partners.move);
  const remove = useMutation(api.contenus.partners.remove);
  const { run, pending } = useRunAction();

  const [editing, setEditing] = useState<Id<'contentPartners'> | 'new' | null>(
    null,
  );
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [lang, setLang] = useState<SiteLocale>('fr');
  const current = useQuery(
    api.contenus.partners.adminGet,
    editing && editing !== 'new' ? { id: editing } : 'skip',
  );
  useEffect(() => {
    if (!current) return;
    setDraft({
      slug: current.slug,
      name: current.name,
      kicker: current.kicker,
      summary: current.summary,
      gives: current.gives,
      gets: current.gets,
      logoMediaId: current.logoMediaId,
      url: current.url ?? '',
    });
  }, [current]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  function open(id: Id<'contentPartners'> | 'new') {
    setEditing(id);
    setLang('fr');
    if (id === 'new') setDraft(EMPTY);
  }

  async function submit() {
    const title = previewText(draft.name, loc).text || draft.slug;
    const id = await run(
      () =>
        save({
          ...(editing && editing !== 'new'
            ? { id: editing }
            : { slug: draft.slug.trim() }),
          name: draft.name,
          kicker: draft.kicker,
          summary: draft.summary,
          gives: draft.gives,
          gets: draft.gets,
          logoMediaId: draft.logoMediaId,
          url: draft.url.trim() || undefined,
        }),
      t('saved', { title }),
    );
    if (id) setEditing(null);
  }

  const name = previewText(draft.name, lang);
  const summary = previewText(draft.summary, lang);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">{t('tab_partners')}</h1>
        <Button type="button" className="min-h-11" onClick={() => open('new')}>
          {t('pa_new')}
        </Button>
      </div>

      {editing ? (
        <EditorShell
          title={
            editing === 'new'
              ? t('pa_new')
              : t('editItem', { title: previewText(draft.name, loc).text })
          }
          onSubmit={submit}
          onClose={() => setEditing(null)}
          pending={pending}
          aside={
            <PreviewCard
              heading={t('preview', { lang: langName(lang) })}
              fallback={name.fallback}
            >
              <div lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                <p className="font-display text-lg leading-snug wrap-anywhere">
                  {name.text || '—'}
                </p>
                {summary.text ? (
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-soft wrap-anywhere">
                    {summary.text}
                  </p>
                ) : null}
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
          <LangSwitch
            value={lang}
            onChange={setLang}
            missing={missingIn([draft.name])}
          />
          <LocalizedInput
            label={t('pa_name')}
            value={draft.name}
            onChange={(v) => set('name', v)}
            lang={lang}
            required
            maxLength={200}
          />
          <LocalizedInput
            label={t('pa_kicker')}
            value={draft.kicker}
            onChange={(v) => set('kicker', v)}
            lang={lang}
            maxLength={200}
          />
          <LocalizedInput
            label={t('pa_summary')}
            value={draft.summary}
            onChange={(v) => set('summary', v)}
            lang={lang}
            multiline
            maxLength={4000}
          />
          <LocalizedInput
            label={t('pa_gives')}
            value={draft.gives}
            onChange={(v) => set('gives', v)}
            lang={lang}
            multiline
            maxLength={4000}
          />
          <LocalizedInput
            label={t('pa_gets')}
            value={draft.gets}
            onChange={(v) => set('gets', v)}
            lang={lang}
            multiline
            maxLength={4000}
          />
          <MediaPicker
            label={t('pa_logo')}
            value={draft.logoMediaId}
            onChange={(v) => set('logoMediaId', v)}
          />
          <TextField
            label={t('pa_url')}
            type="url"
            value={draft.url}
            onChange={(e) => set('url', e.target.value)}
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
                  {r.name}
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
                  aria-label={t('moveUp', { title: r.name })}
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
                  aria-label={t('moveDown', { title: r.name })}
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
                  aria-label={t('editItem', { title: r.name })}
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
                          t('unpublishedMsg', { title: r.name }),
                        )
                      : run(
                          () => setStatus({ id: r._id, status: 'published' }),
                          t('publishedMsg', { title: r.name }),
                        )
                  }
                >
                  {r.status === 'published' ? t('unpublish') : t('publish')}
                </Button>
                <ConfirmButton
                  label={t('delete')}
                  title={t('confirmDelete', { title: r.name })}
                  description={t('confirmDeleteBody')}
                  confirmLabel={t('delete')}
                  onConfirm={() =>
                    run(
                      () => remove({ id: r._id }),
                      t('deletedMsg', { title: r.name }),
                    )
                  }
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
