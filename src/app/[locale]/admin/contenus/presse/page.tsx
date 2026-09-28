'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { SITE_LOCALES, type SiteLocale } from '@convex/lib/locales';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import {
  LangSwitch,
  LocalizedInput,
  StatusBadge,
  missingIn,
  useLangName,
  type LText,
} from '@/components/admin/contenus/localized';
import {
  ConfirmButton,
  EditorShell,
  useRunAction,
} from '@/components/admin/contenus/editor-shell';

// PRESS REVIEW — EDITING (F-16, F-62). An article: title (in its own language,
// untranslated), outlet, date, language, link; an optional translatable excerpt.

type Draft = {
  title: string;
  outlet: string;
  publishedOn: string;
  lang: SiteLocale;
  url: string;
  excerpt: LText;
};

const EMPTY: Draft = {
  title: '',
  outlet: '',
  publishedOn: '',
  lang: 'fr',
  url: '',
  excerpt: {},
};

export default function AdminContentPress() {
  const t = useTranslations('contentAdmin');
  const langName = useLangName();
  const rows = useQuery(api.contenus.press.adminList, {});
  const save = useMutation(api.contenus.press.save);
  const setStatus = useMutation(api.contenus.press.setStatus);
  const remove = useMutation(api.contenus.press.remove);
  const { run, pending } = useRunAction();

  const [editing, setEditing] = useState<Id<'contentPress'> | 'new' | null>(
    null,
  );
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [lang, setLang] = useState<SiteLocale>('fr');

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // The list already carries all the fields: no second read when editing.
  function open(id: Id<'contentPress'> | 'new') {
    setEditing(id);
    setLang('fr');
    const row = id === 'new' ? null : rows?.find((r) => r._id === id);
    setDraft(
      row
        ? {
            title: row.title,
            outlet: row.outlet,
            publishedOn: row.publishedOn,
            lang: row.lang,
            url: row.url,
            excerpt: row.excerpt,
          }
        : EMPTY,
    );
  }

  async function submit() {
    const id = await run(
      () =>
        save({
          ...(editing && editing !== 'new' ? { id: editing } : {}),
          ...draft,
        }),
      t('saved', { title: draft.title }),
    );
    if (id) setEditing(null);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">{t('tab_press')}</h1>
        <Button type="button" className="min-h-11" onClick={() => open('new')}>
          {t('pr_new')}
        </Button>
      </div>

      {editing ? (
        <EditorShell
          title={
            editing === 'new'
              ? t('pr_new')
              : t('editItem', { title: draft.title })
          }
          onSubmit={submit}
          onClose={() => setEditing(null)}
          pending={pending}
        >
          <TextField
            label={t('pr_title')}
            hint={t('pr_titleHint')}
            lang={draft.lang}
            value={draft.title}
            onChange={(e) => set('title', e.target.value)}
            required
            maxLength={200}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={t('pr_outlet')}
              value={draft.outlet}
              onChange={(e) => set('outlet', e.target.value)}
              required
              maxLength={200}
            />
            <TextField
              label={t('pr_date')}
              type="date"
              value={draft.publishedOn}
              onChange={(e) => set('publishedOn', e.target.value)}
              required
            />
            <SelectField
              label={t('pr_lang')}
              value={draft.lang}
              onChange={(e) => set('lang', e.target.value as SiteLocale)}
            >
              {SITE_LOCALES.map((l) => (
                <option key={l} value={l}>
                  {langName(l)}
                </option>
              ))}
            </SelectField>
            <TextField
              label={t('pr_url')}
              type="url"
              value={draft.url}
              onChange={(e) => set('url', e.target.value)}
              required
            />
          </div>
          <LangSwitch
            value={lang}
            onChange={setLang}
            missing={missingIn([draft.excerpt])}
          />
          <LocalizedInput
            label={t('pr_excerpt')}
            value={draft.excerpt}
            onChange={(v) => set('excerpt', v)}
            lang={lang}
            multiline
            maxLength={400}
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
                <span
                  lang={r.lang}
                  className="block font-medium text-ink wrap-anywhere"
                >
                  {r.title}
                </span>
                <span className="font-mono text-[11px] text-muted wrap-anywhere">
                  {r.outlet} · {r.publishedOn} · {langName(r.lang)}
                </span>
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
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
