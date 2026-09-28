'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { SITE_LOCALES, type SiteLocale } from '@convex/lib/locales';
import { NETWORK_THEMES } from '@convex/lib/themes';
import { resolveLocale } from '@/i18n/locale';
import { getEventsLabels } from '@/lib/events-content';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { ScrollableRegion } from '@/components/ui/scrollable-region';
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

// REPLAYS — ÉDITION (F-54, F-62). Lien YouTube, Vimeo ou fichier vidéo,
// validé côté serveur contre sa plateforme ; événement lié ; thèmes ; langues.
// Un replay sans vidéo reste publiable : la page publique dit alors
// « enregistrement bientôt disponible ».

type VideoKind = '' | 'youtube' | 'vimeo' | 'file';
type Draft = {
  slug: string;
  title: LText;
  description: LText;
  eventId: Id<'contentEvents'> | '';
  videoKind: VideoKind;
  videoUrl: string;
  themes: string[];
  langs: SiteLocale[];
  recordedOn: string;
  durationMin: string;
  posterMediaId: Id<'contentMedia'> | undefined;
};

const EMPTY: Draft = {
  slug: '',
  title: {},
  description: {},
  eventId: '',
  videoKind: '',
  videoUrl: '',
  themes: ['participation'],
  langs: ['fr'],
  recordedOn: '',
  durationMin: '',
  posterMediaId: undefined,
};

const THEMES = ['vie-reseau', ...NETWORK_THEMES];

export default function AdminContentReplays() {
  const t = useTranslations('contentAdmin');
  const loc = resolveLocale(useLocale());
  const L = getEventsLabels(loc);
  const langName = useLangName();
  const rows = useQuery(api.contenus.replays.adminList, { locale: loc });
  const events = useQuery(api.contenus.events.adminOptions, { locale: loc });
  const save = useMutation(api.contenus.replays.save);
  const setStatus = useMutation(api.contenus.replays.setStatus);
  const remove = useMutation(api.contenus.replays.remove);
  const { run, pending } = useRunAction();

  const [editing, setEditing] = useState<Id<'contentReplays'> | 'new' | null>(
    null,
  );
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [lang, setLang] = useState<SiteLocale>('fr');
  const current = useQuery(
    api.contenus.replays.adminGet,
    editing && editing !== 'new' ? { id: editing } : 'skip',
  );
  useEffect(() => {
    if (!current) return;
    setDraft({
      slug: current.slug,
      title: current.title,
      description: current.description,
      eventId: current.eventId ?? '',
      videoKind: current.videoKind ?? '',
      videoUrl: current.videoUrl ?? '',
      themes: current.themes,
      langs: current.langs,
      recordedOn: current.recordedOn,
      durationMin: current.durationMin?.toString() ?? '',
      posterMediaId: current.posterMediaId,
    });
  }, [current]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const toggle = <T extends string>(list: T[], v: T, on: boolean) =>
    on ? [...list, v] : list.filter((x) => x !== v);

  function open(id: Id<'contentReplays'> | 'new') {
    setEditing(id);
    setLang('fr');
    if (id === 'new') setDraft(EMPTY);
  }

  async function submit() {
    const title = previewText(draft.title, loc).text || draft.slug;
    const duration = Number(draft.durationMin);
    const id = await run(
      () =>
        save({
          ...(editing && editing !== 'new'
            ? { id: editing }
            : { slug: draft.slug.trim() }),
          title: draft.title,
          description: draft.description,
          eventId: draft.eventId || undefined,
          videoKind: draft.videoKind || undefined,
          videoUrl: draft.videoUrl.trim() || undefined,
          themes: draft.themes,
          langs: draft.langs,
          recordedOn: draft.recordedOn,
          durationMin:
            draft.durationMin.trim() && Number.isFinite(duration)
              ? duration
              : undefined,
          posterMediaId: draft.posterMediaId,
        }),
      t('saved', { title }),
    );
    if (id) setEditing(null);
  }

  const preview = previewText(draft.title, lang);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">{t('tab_replays')}</h1>
        <Button type="button" className="min-h-11" onClick={() => open('new')}>
          {t('rp_new')}
        </Button>
      </div>

      {editing ? (
        <EditorShell
          title={
            editing === 'new'
              ? t('rp_new')
              : t('editItem', { title: previewText(draft.title, loc).text })
          }
          onSubmit={submit}
          onClose={() => setEditing(null)}
          pending={pending}
          aside={
            <PreviewCard
              heading={t('preview', { lang: langName(lang) })}
              fallback={preview.fallback}
            >
              <p
                lang={lang}
                dir={lang === 'ar' ? 'rtl' : 'ltr'}
                className="font-display text-lg leading-snug wrap-anywhere"
              >
                {preview.text || '—'}
              </p>
              <p className="mt-2 text-[13px] text-ink-soft">
                {draft.videoUrl ? t('rp_hasVideo') : t('rp_noVideo')}
              </p>
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
            missing={missingIn([draft.title])}
          />
          <LocalizedInput
            label={t('rp_title')}
            value={draft.title}
            onChange={(v) => set('title', v)}
            lang={lang}
            required
            maxLength={200}
          />
          <LocalizedInput
            label={t('rp_description')}
            value={draft.description}
            onChange={(v) => set('description', v)}
            lang={lang}
            multiline
            maxLength={4000}
          />
          <SelectField
            label={t('rp_event')}
            value={draft.eventId}
            onChange={(e) =>
              set('eventId', e.target.value as Id<'contentEvents'> | '')
            }
          >
            <option value="">{t('rp_eventNone')}</option>
            {(events ?? []).map((ev) => (
              <option key={ev._id} value={ev._id}>
                {ev.startDate} · {ev.title}
              </option>
            ))}
          </SelectField>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label={t('rp_videoKind')}
              value={draft.videoKind}
              onChange={(e) => set('videoKind', e.target.value as VideoKind)}
            >
              <option value="">{t('rp_video_none')}</option>
              <option value="youtube">{t('rp_video_youtube')}</option>
              <option value="vimeo">{t('rp_video_vimeo')}</option>
              <option value="file">{t('rp_video_file')}</option>
            </SelectField>
            <TextField
              label={t('rp_recordedOn')}
              type="date"
              value={draft.recordedOn}
              onChange={(e) => set('recordedOn', e.target.value)}
              required
            />
          </div>
          {draft.videoKind ? (
            <TextField
              label={t('rp_videoUrl')}
              hint={t('rp_videoUrlHint')}
              type="url"
              value={draft.videoUrl}
              onChange={(e) => set('videoUrl', e.target.value)}
              required
            />
          ) : null}
          <TextField
            label={t('rp_duration')}
            type="number"
            min={1}
            inputMode="numeric"
            value={draft.durationMin}
            onChange={(e) => set('durationMin', e.target.value)}
          />
          <fieldset>
            <legend className="text-sm text-ink-soft">{t('rp_themes')}</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {THEMES.map((th) => (
                <label
                  key={th}
                  className="inline-flex min-h-11 items-center gap-2 rounded-sm border border-line bg-surface px-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={draft.themes.includes(th)}
                    onChange={(e) =>
                      set('themes', toggle(draft.themes, th, e.target.checked))
                    }
                  />
                  {L.themes[th as keyof typeof L.themes] ?? th}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm text-ink-soft">{t('rp_langs')}</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {SITE_LOCALES.map((l) => (
                <label
                  key={l}
                  className="inline-flex min-h-11 items-center gap-2 rounded-sm border border-line bg-surface px-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={draft.langs.includes(l)}
                    onChange={(e) =>
                      set('langs', toggle(draft.langs, l, e.target.checked))
                    }
                  />
                  {langName(l)}
                </label>
              ))}
            </div>
          </fieldset>
          <MediaPicker
            label={t('rp_poster')}
            value={draft.posterMediaId}
            onChange={(v) => set('posterMediaId', v)}
          />
        </EditorShell>
      ) : null}

      {rows === undefined ? (
        <p className="mt-6 text-ink-soft">{t('loading')}</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-ink-soft">{t('empty')}</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-md border border-line">
          <ScrollableRegion label={t('tab_replays')}>
            <table className="w-full border-collapse text-start text-sm">
              <thead>
                <tr className="border-b border-line text-[12px] uppercase tracking-[0.04em] text-muted">
                  <th
                    scope="col"
                    className="px-4 py-2.5 text-start font-medium"
                  >
                    {t('colTitle')}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-2.5 text-start font-medium"
                  >
                    {t('colDate')}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-2.5 text-start font-medium"
                  >
                    {t('colStatus')}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-2.5 text-start font-medium"
                  >
                    {t('colLangs')}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-2.5 text-start font-medium"
                  >
                    {t('colActions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r._id}
                    className="border-b border-line last:border-0"
                  >
                    <td className="px-4 py-2.5 align-top">
                      <span className="block font-medium text-ink wrap-anywhere">
                        {r.title}
                      </span>
                      <span className="text-[12px] text-muted">
                        {r.hasVideo ? t('rp_hasVideo') : t('rp_noVideo')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 align-top font-mono text-[12px] text-muted">
                      {r.recordedOn}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <MissingLangs missing={r.missing} />
                    </td>
                    <td className="px-4 py-2.5 align-top">
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
                                  () =>
                                    setStatus({ id: r._id, status: 'draft' }),
                                  t('unpublishedMsg', { title: r.title }),
                                )
                              : run(
                                  () =>
                                    setStatus({
                                      id: r._id,
                                      status: 'published',
                                    }),
                                  t('publishedMsg', { title: r.title }),
                                )
                          }
                        >
                          {r.status === 'published'
                            ? t('unpublish')
                            : t('publish')}
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableRegion>
        </div>
      )}
    </div>
  );
}
