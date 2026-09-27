'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { SITE_LOCALES, type SiteLocale } from '@convex/lib/locales';
import { NETWORK_THEMES } from '@convex/lib/themes';
import { resolveLocale, intlLocale } from '@/i18n/locale';
import { Link } from '@/i18n/navigation';
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

// AGENDA — ÉDITION (F-52, F-62). Créer, modifier, publier, dépublier, annuler
// un événement ; les INSCRIPTIONS restent sur `/admin/evenements` (rang
// modérateur), où chaque événement porte son export CSV. Aucune donnée n'est
// dupliquée entre les deux écrans : celui-ci édite l'événement, l'autre lit
// ses inscrits.

type EventType = 'sommet' | 'webinaire' | 'atelier';
type EventRegion = 'afrique' | 'europe' | 'en-ligne';
type EventFormat = 'presentiel' | 'en-ligne' | 'hybride';

type Draft = {
  slug: string;
  type: EventType;
  region: EventRegion;
  format: EventFormat;
  theme: string;
  langs: SiteLocale[];
  title: LText;
  summary: LText;
  place: LText;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  timezone: string;
  visioUrl: string;
  capacity: string;
  durationMin: string;
  featured: boolean;
  imageMediaId: Id<'contentMedia'> | undefined;
};

const EMPTY: Draft = {
  slug: '',
  type: 'webinaire',
  region: 'en-ligne',
  format: 'en-ligne',
  theme: 'participation',
  langs: ['fr'],
  title: {},
  summary: {},
  place: {},
  startDate: '',
  startTime: '',
  endDate: '',
  endTime: '',
  timezone: 'Europe/Paris',
  visioUrl: '',
  capacity: '',
  durationMin: '',
  featured: false,
  imageMediaId: undefined,
};

// Fuseaux proposés (liste ouverte : tout fuseau IANA est accepté).
const TIMEZONES = [
  'Europe/Paris',
  'Europe/Brussels',
  'Europe/London',
  'Europe/Lisbon',
  'Europe/Madrid',
  'Africa/Dakar',
  'Africa/Abidjan',
  'Africa/Lagos',
  'Africa/Casablanca',
  'Africa/Tunis',
  'Africa/Cairo',
  'Africa/Nairobi',
  'Africa/Johannesburg',
  'America/Sao_Paulo',
  'UTC',
];

const THEMES = ['vie-reseau', ...NETWORK_THEMES];

function optNumber(v: string): number | undefined {
  const n = Number(v);
  return v.trim() && Number.isFinite(n) ? n : undefined;
}

export default function AdminContentEvents() {
  const t = useTranslations('contentAdmin');
  const loc = resolveLocale(useLocale());
  const L = getEventsLabels(loc);
  const langName = useLangName();
  const rows = useQuery(api.contenus.events.adminList, { locale: loc });
  const save = useMutation(api.contenus.events.save);
  const setStatus = useMutation(api.contenus.events.setStatus);
  const remove = useMutation(api.contenus.events.remove);
  const { run, pending } = useRunAction();

  const [editing, setEditing] = useState<Id<'contentEvents'> | 'new' | null>(
    null,
  );
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [lang, setLang] = useState<SiteLocale>('fr');
  const current = useQuery(
    api.contenus.events.adminGet,
    editing && editing !== 'new' ? { id: editing } : 'skip',
  );

  // Chargement de la fiche à éditer dans le brouillon du formulaire.
  useEffect(() => {
    if (!current) return;
    setDraft({
      slug: current.slug,
      type: current.type,
      region: current.region,
      format: current.format,
      theme: current.theme,
      langs: current.langs,
      title: current.title,
      summary: current.summary,
      place: current.place,
      startDate: current.startDate,
      startTime: current.startTime ?? '',
      endDate: current.endDate ?? '',
      endTime: current.endTime ?? '',
      timezone: current.timezone,
      visioUrl: current.visioUrl ?? '',
      capacity: current.capacity?.toString() ?? '',
      durationMin: current.durationMin?.toString() ?? '',
      featured: current.featured,
      imageMediaId: current.imageMediaId,
    });
  }, [current]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  function open(id: Id<'contentEvents'> | 'new') {
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
          type: draft.type,
          region: draft.region,
          format: draft.format,
          theme: draft.theme,
          langs: draft.langs,
          title: draft.title,
          summary: draft.summary,
          place: draft.place,
          startDate: draft.startDate,
          startTime: draft.startTime || undefined,
          endDate: draft.endDate || undefined,
          endTime: draft.endTime || undefined,
          timezone: draft.timezone,
          visioUrl: draft.visioUrl.trim() || undefined,
          capacity: optNumber(draft.capacity),
          durationMin: optNumber(draft.durationMin),
          featured: draft.featured,
          imageMediaId: draft.imageMediaId,
        }),
      t('saved', { title }),
    );
    if (id) setEditing(null);
  }

  const fmtDate = (ms: number) =>
    new Intl.DateTimeFormat(intlLocale(loc), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(ms);

  const missing = missingIn([draft.title, draft.place]);
  const preview = previewText(draft.title, lang);
  const previewPlace = previewText(draft.place, lang);
  const previewSummary = previewText(draft.summary, lang);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">{t('tab_events')}</h1>
        <Button type="button" className="min-h-11" onClick={() => open('new')}>
          {t('ev_new')}
        </Button>
      </div>

      {editing ? (
        <EditorShell
          title={
            editing === 'new'
              ? t('ev_new')
              : t('editItem', { title: previewText(draft.title, loc).text })
          }
          onSubmit={submit}
          onClose={() => setEditing(null)}
          pending={pending}
          aside={
            <PreviewCard
              heading={t('preview', { lang: langName(lang) })}
              fallback={
                preview.fallback || previewPlace.fallback || !draft.title[lang]
              }
            >
              <div lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                  {L.types[draft.type]} · {L.formats[draft.format]}
                </p>
                <p className="mt-1 font-display text-lg leading-snug wrap-anywhere">
                  {preview.text || '—'}
                </p>
                <p className="mt-1 text-[13px] text-ink-soft wrap-anywhere">
                  {draft.startDate} · {previewPlace.text}
                </p>
                {previewSummary.text ? (
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-soft wrap-anywhere">
                    {previewSummary.text}
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

          <LangSwitch value={lang} onChange={setLang} missing={missing} />
          <LocalizedInput
            label={t('ev_title')}
            value={draft.title}
            onChange={(v) => set('title', v)}
            lang={lang}
            required
            maxLength={200}
          />
          <LocalizedInput
            label={t('ev_place')}
            value={draft.place}
            onChange={(v) => set('place', v)}
            lang={lang}
            required
            maxLength={200}
          />
          <LocalizedInput
            label={t('ev_summary')}
            value={draft.summary}
            onChange={(v) => set('summary', v)}
            lang={lang}
            multiline
            maxLength={4000}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label={t('ev_type')}
              value={draft.type}
              onChange={(e) => set('type', e.target.value as EventType)}
            >
              {(['sommet', 'webinaire', 'atelier'] as const).map((v) => (
                <option key={v} value={v}>
                  {L.types[v]}
                </option>
              ))}
            </SelectField>
            <SelectField
              label={t('ev_format')}
              value={draft.format}
              onChange={(e) => set('format', e.target.value as EventFormat)}
            >
              {(['presentiel', 'en-ligne', 'hybride'] as const).map((v) => (
                <option key={v} value={v}>
                  {L.formats[v]}
                </option>
              ))}
            </SelectField>
            <SelectField
              label={t('ev_region')}
              value={draft.region}
              onChange={(e) => set('region', e.target.value as EventRegion)}
            >
              {(['afrique', 'europe', 'en-ligne'] as const).map((v) => (
                <option key={v} value={v}>
                  {L.regions[v]}
                </option>
              ))}
            </SelectField>
            <SelectField
              label={t('ev_theme')}
              value={draft.theme}
              onChange={(e) => set('theme', e.target.value)}
            >
              {THEMES.map((v) => (
                <option key={v} value={v}>
                  {L.themes[v as keyof typeof L.themes] ?? v}
                </option>
              ))}
            </SelectField>
          </div>

          <fieldset>
            <legend className="text-sm text-ink-soft">{t('ev_langs')}</legend>
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
                      set(
                        'langs',
                        e.target.checked
                          ? [...draft.langs, l]
                          : draft.langs.filter((x) => x !== l),
                      )
                    }
                  />
                  {langName(l)}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={t('ev_startDate')}
              type="date"
              value={draft.startDate}
              onChange={(e) => set('startDate', e.target.value)}
              required
            />
            <TextField
              label={t('ev_startTime')}
              type="time"
              value={draft.startTime}
              onChange={(e) => set('startTime', e.target.value)}
            />
            <TextField
              label={t('ev_endDate')}
              type="date"
              value={draft.endDate}
              onChange={(e) => set('endDate', e.target.value)}
            />
            <TextField
              label={t('ev_endTime')}
              type="time"
              value={draft.endTime}
              onChange={(e) => set('endTime', e.target.value)}
            />
          </div>
          <TextField
            label={t('ev_timezone')}
            hint={t('ev_timezoneHint')}
            list="content-timezones"
            value={draft.timezone}
            onChange={(e) => set('timezone', e.target.value)}
            required
          />
          <datalist id="content-timezones">
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz} />
            ))}
          </datalist>

          <TextField
            label={t('ev_visio')}
            hint={t('ev_visioHint')}
            type="url"
            value={draft.visioUrl}
            onChange={(e) => set('visioUrl', e.target.value)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={t('ev_capacity')}
              hint={t('ev_capacityHint')}
              type="number"
              min={1}
              max={5000}
              inputMode="numeric"
              value={draft.capacity}
              onChange={(e) => set('capacity', e.target.value)}
            />
            <TextField
              label={t('ev_duration')}
              type="number"
              min={1}
              inputMode="numeric"
              value={draft.durationMin}
              onChange={(e) => set('durationMin', e.target.value)}
            />
          </div>
          <label className="inline-flex min-h-11 items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={draft.featured}
              onChange={(e) => set('featured', e.target.checked)}
            />
            {t('ev_featured')}
          </label>
          <MediaPicker
            label={t('ev_image')}
            value={draft.imageMediaId}
            onChange={(v) => set('imageMediaId', v)}
          />
        </EditorShell>
      ) : null}

      {rows === undefined ? (
        <p className="mt-6 text-ink-soft">{t('loading')}</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-ink-soft">{t('empty')}</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-md border border-line">
          <ScrollableRegion label={t('tab_events')}>
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
                      <span className="font-mono text-[11px] text-muted">
                        {L.types[r.type]} · {r.slug}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 align-top font-mono text-[12px] text-muted">
                      {fmtDate(r.startsAt)}
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
                        {r.status !== 'published' ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="min-h-11"
                            onClick={() =>
                              run(
                                () =>
                                  setStatus({ id: r._id, status: 'published' }),
                                t('publishedMsg', { title: r.title }),
                              )
                            }
                          >
                            {t('publish')}
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="min-h-11"
                            onClick={() =>
                              run(
                                () => setStatus({ id: r._id, status: 'draft' }),
                                t('unpublishedMsg', { title: r.title }),
                              )
                            }
                          >
                            {t('unpublish')}
                          </Button>
                        )}
                        {r.status === 'published' ? (
                          <ConfirmButton
                            label={t('cancelEvent')}
                            title={t('confirmCancel', { title: r.title })}
                            description={t('confirmCancelBody')}
                            confirmLabel={t('cancelEvent')}
                            onConfirm={() =>
                              run(
                                () =>
                                  setStatus({ id: r._id, status: 'cancelled' }),
                                t('cancelledMsg', { title: r.title }),
                              )
                            }
                          />
                        ) : null}
                        {r.status === 'draft' ? (
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
                        ) : null}
                        <Link
                          href={`/admin/evenements#${r.slug}`}
                          className="inline-flex min-h-11 items-center px-3 text-xs font-medium text-accent-text hover:underline"
                        >
                          {t('ev_registrations')}
                        </Link>
                        {r.status !== 'draft' ? (
                          <Link
                            href={`/evenements/${r.slug}`}
                            className="inline-flex min-h-11 items-center px-3 text-xs font-medium text-accent-text hover:underline"
                          >
                            {t('ev_viewPublic')}
                          </Link>
                        ) : null}
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
