'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { FIELD_MAX } from '@convex/lib/validation';
import {
  LEVELS,
  PROGRAMME_LANGUAGES,
  PROGRAMME_LIMITS,
  PROGRAMME_THEMES,
  RESOURCE_KINDS,
  type Level,
  type ResourceKind,
} from '@convex/lib/programmes';
import type { SiteLocale } from '@convex/lib/locales';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import {
  Field,
  FormError,
  TextField,
  TextareaField,
} from '@/components/ui/field';
import { ComboboxField, SelectField } from '@/components/ui/choice-fields';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useActionFeedback } from '@/components/admin/action-feedback';
import { vocabulary } from '@/i18n/vocabulary';
import { uploadWithProgress } from '@/lib/upload';
import {
  CheckGroup,
  StatusPill,
  useProgrammeError,
} from '@/components/programmes/shared';

type AdminResource = FunctionReturnType<
  typeof api.toolbox.adminListResources
>[number];
type AdminPath = FunctionReturnType<typeof api.toolbox.adminListPaths>[number];

// Toolbox and learning paths (F-56, F-57) — EDITOR rank, like the other
// editorial content.
export default function AdminToolbox() {
  const t = useTranslations('toolbox');
  const [tab, setTab] = useState<'resources' | 'paths'>('resources');
  return (
    <div>
      <h1 className="font-display text-3xl">{t('adminTitle')}</h1>
      <p className="mt-2 text-sm">
        <Link
          href="/boite-a-outils"
          className="text-accent-text hover:underline"
        >
          {t('adminSeePublic')}
        </Link>
      </p>
      <ToggleGroup
        type="single"
        value={tab}
        onValueChange={(v) => {
          if (v === 'resources' || v === 'paths') setTab(v);
        }}
        aria-label={t('adminTitle')}
        className="mt-4"
      >
        <ToggleGroupItem value="resources">
          {t('resourcesTitle')}
        </ToggleGroupItem>
        <ToggleGroupItem value="paths">{t('pathsTitle')}</ToggleGroupItem>
      </ToggleGroup>
      {tab === 'resources' ? <Resources /> : <Paths />}
    </div>
  );
}

function Resources() {
  const t = useTranslations('toolbox');
  const tl = useTranslations('library');
  const resources = useQuery(api.toolbox.adminListResources);
  const setStatus = useMutation(api.toolbox.setResourceStatus);
  const notify = useActionFeedback();
  const errorMessage = useProgrammeError();
  const [editing, setEditing] = useState<AdminResource | 'new' | null>(null);
  return (
    <section className="mt-6">
      {editing === null ? (
        <Button className="min-h-11" onClick={() => setEditing('new')}>
          {t('newResource')}
        </Button>
      ) : (
        <ResourceEditor
          resource={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      )}
      {resources === undefined ? (
        <p className="mt-4 text-ink-soft">{t('loading')}</p>
      ) : resources.length === 0 ? (
        <p className="mt-4 text-ink-soft">{t('empty')}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {resources.map((r) => (
            <li
              key={r._id}
              className="rounded-md border border-line bg-surface p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="min-w-0 wrap-anywhere font-medium text-ink">
                  {r.title}
                </h2>
                <StatusPill
                  tone={r.status === 'published' ? 'good' : 'neutral'}
                >
                  {vocabulary(t, 'status_', r.status)}
                </StatusPill>
                <span className="text-[12px] text-muted">
                  {vocabulary(t, 'kind_', r.kind)} ·{' '}
                  {vocabulary(t, 'level_', r.level)} ·{' '}
                  {vocabulary(tl, 'langs.', r.language)}
                </span>
              </div>
              <p className="mt-1 wrap-anywhere text-[13px] text-ink-soft">
                {r.fileName ?? r.url}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => setEditing(r)}
                >
                  {t('edit')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  onClick={async () => {
                    try {
                      await setStatus({
                        resourceId: r._id,
                        status:
                          r.status === 'published' ? 'draft' : 'published',
                      });
                      notify(
                        r.status === 'published'
                          ? t('unpublished', { title: r.title })
                          : t('published', { title: r.title }),
                      );
                    } catch (err) {
                      notify(errorMessage(err), 'error');
                    }
                  }}
                >
                  {r.status === 'published' ? t('unpublish') : t('publish')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ResourceEditor({
  resource,
  onDone,
}: {
  resource: AdminResource | null;
  onDone: () => void;
}) {
  const t = useTranslations('toolbox');
  const tl = useTranslations('library');
  const save = useMutation(api.toolbox.saveResource);
  const generate = useMutation(api.toolbox.generateResourceUploadUrl);
  const notify = useActionFeedback();
  const errorMessage = useProgrammeError();
  const [title, setTitle] = useState(resource?.title ?? '');
  const [summary, setSummary] = useState(resource?.summary ?? '');
  const [kind, setKind] = useState<ResourceKind>(resource?.kind ?? 'guide');
  const [themes, setThemes] = useState<string[]>(resource?.themes ?? []);
  const [language, setLanguage] = useState<string>(resource?.language ?? 'fr');
  const [level, setLevel] = useState<Level>(resource?.level ?? 'debutant');
  const [url, setUrl] = useState(resource?.url ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    try {
      let fileId: Id<'_storage'> | undefined;
      if (file) {
        setProgress(0);
        const uploadUrl = await generate();
        const res = await uploadWithProgress<{ storageId: Id<'_storage'> }>({
          url: uploadUrl,
          file,
          contentType: file.type || 'application/octet-stream',
          onProgress: (p) => setProgress(p.percent ?? 0),
        });
        fileId = res.storageId;
      }
      await save({
        resourceId: resource?._id,
        title,
        summary,
        kind,
        themes,
        language: language as SiteLocale,
        level,
        url: url.trim() || undefined,
        fileId,
        fileName: file?.name,
      });
      notify(t('saved', { title: title.trim() }));
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setProgress(null);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="grid gap-4 rounded-md border border-accent-edge bg-surface p-5 sm:grid-cols-2"
      aria-label={resource ? t('edit') : t('newResource')}
    >
      <TextField
        label={t('fieldTitle')}
        id="res-title"
        className="sm:col-span-2"
        required
        maxLength={PROGRAMME_LIMITS.shortText}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <TextareaField
        label={t('fieldSummary')}
        id="res-summary"
        className="sm:col-span-2"
        rows={3}
        required
        maxLength={FIELD_MAX.body}
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
      />
      <SelectField
        label={t('filterKind')}
        id="res-kind"
        value={kind}
        onValueChange={(v) => setKind(v as ResourceKind)}
        options={RESOURCE_KINDS.map((k) => ({
          value: k,
          label: vocabulary(t, 'kind_', k),
        }))}
      />
      <SelectField
        label={t('filterLevel')}
        id="res-level"
        value={level}
        onValueChange={(v) => setLevel(v as Level)}
        options={LEVELS.map((k) => ({
          value: k,
          label: vocabulary(t, 'level_', k),
        }))}
      />
      <SelectField
        label={t('filterLanguage')}
        id="res-lang"
        value={language}
        onValueChange={setLanguage}
        options={PROGRAMME_LANGUAGES.map((k) => ({
          value: k,
          label: vocabulary(tl, 'langs.', k),
        }))}
      />
      <TextField
        label={t('fieldUrl')}
        id="res-url"
        type="url"
        hint={t('fieldUrlHint')}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <CheckGroup
        className="sm:col-span-2"
        legend={t('filterTheme')}
        options={PROGRAMME_THEMES.map((s) => ({
          value: s,
          label: vocabulary(tl, 'themes.', s),
        }))}
        value={themes}
        onChange={setThemes}
      />
      <Field
        className="sm:col-span-2"
        id="res-file"
        label={
          resource?.fileName
            ? t('fieldFileReplace', { name: resource.fileName })
            : t('fieldFile')
        }
        hint={progress !== null ? t('uploading', { pct: progress }) : undefined}
      >
        {(control) => (
          <input
            {...control}
            type="file"
            className="block min-h-11 w-full text-sm text-ink-soft file:me-3 file:min-h-11 file:rounded-sm file:border file:border-line-strong file:bg-surface-2 file:px-3 file:text-ink"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        )}
      </Field>
      <FormError className="sm:col-span-2">{error}</FormError>
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        <Button type="submit" disabled={progress !== null}>
          {t('save')}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}

function Paths() {
  const t = useTranslations('toolbox');
  const paths = useQuery(api.toolbox.adminListPaths);
  const resources = useQuery(api.toolbox.adminListResources);
  const [editing, setEditing] = useState<AdminPath | 'new' | null>(null);
  return (
    <section className="mt-6">
      {editing === null ? (
        <Button className="min-h-11" onClick={() => setEditing('new')}>
          {t('newPath')}
        </Button>
      ) : (
        <PathEditor
          path={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      )}
      {paths === undefined ? (
        <p className="mt-4 text-ink-soft">{t('loading')}</p>
      ) : paths.length === 0 ? (
        <p className="mt-4 text-ink-soft">{t('pathsEmpty')}</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {paths.map((p) => (
            <PathRow
              key={p._id}
              path={p}
              resources={resources ?? []}
              onEdit={() => setEditing(p)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function PathRow({
  path,
  resources,
  onEdit,
}: {
  path: AdminPath;
  resources: AdminResource[];
  onEdit: () => void;
}) {
  const t = useTranslations('toolbox');
  const setStatus = useMutation(api.toolbox.setPathStatus);
  const move = useMutation(api.toolbox.moveStep);
  const remove = useMutation(api.toolbox.removeStep);
  const addStep = useMutation(api.toolbox.addStep);
  const notify = useActionFeedback();
  const errorMessage = useProgrammeError();
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [resourceId, setResourceId] = useState('');
  const [url, setUrl] = useState('');
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) notify(ok);
    } catch (err) {
      notify(errorMessage(err), 'error');
    }
  };
  return (
    <li className="rounded-md border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="min-w-0 wrap-anywhere font-medium text-ink">
          {path.title}
        </h2>
        <StatusPill tone={path.status === 'published' ? 'good' : 'neutral'}>
          {vocabulary(t, 'status_', path.status)}
        </StatusPill>
        <span className="text-[12px] text-muted">
          {t('enrollmentsCount', { count: path.enrollments })}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="min-h-11"
          onClick={onEdit}
        >
          {t('edit')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="min-h-11"
          onClick={() =>
            run(
              () =>
                setStatus({
                  pathId: path._id,
                  status: path.status === 'published' ? 'draft' : 'published',
                }),
              path.status === 'published'
                ? t('unpublished', { title: path.title })
                : t('published', { title: path.title }),
            )
          }
        >
          {path.status === 'published' ? t('unpublish') : t('publish')}
        </Button>
        {path.status === 'published' ? (
          <Link
            href={`/parcours/${path.slug}`}
            className="inline-flex min-h-11 items-center text-sm text-accent-text hover:underline"
          >
            {t('open')}
          </Link>
        ) : null}
      </div>
      <ol className="mt-4 space-y-2">
        {path.stepList.map((s, i) => (
          <li
            key={s._id}
            className="flex flex-wrap items-center gap-2 rounded-sm border border-line bg-paper p-2 text-[14px]"
          >
            <span className="font-mono text-muted">{i + 1}.</span>
            <span className="min-w-0 flex-1 wrap-anywhere text-ink">
              {s.title}
              <span className="ms-2 text-[12px] text-muted">
                {s.resource ? s.resource.title : s.url}
              </span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="min-h-11"
              disabled={i === 0}
              aria-label={t('moveUp', { title: s.title })}
              onClick={() =>
                run(() => move({ stepId: s._id, direction: 'up' }))
              }
            >
              ↑
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="min-h-11"
              disabled={i === path.stepList.length - 1}
              aria-label={t('moveDown', { title: s.title })}
              onClick={() =>
                run(() => move({ stepId: s._id, direction: 'down' }))
              }
            >
              ↓
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="min-h-11"
              onClick={() => run(() => remove({ stepId: s._id }))}
            >
              {t('removeStep')}
            </Button>
          </li>
        ))}
      </ol>
      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        aria-label={t('addStep')}
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await addStep({
              pathId: path._id,
              title,
              note: note.trim() || undefined,
              resourceId: resourceId
                ? (resourceId as Id<'toolboxResources'>)
                : undefined,
              url: url.trim() || undefined,
            });
            setTitle('');
            setNote('');
            setResourceId('');
            setUrl('');
          });
        }}
      >
        <TextField
          label={t('stepTitleField')}
          id={`step-title-${path._id}`}
          maxLength={PROGRAMME_LIMITS.shortText}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {/* The whole toolbox: searchable, by title. */}
        <ComboboxField
          label={t('stepResource')}
          id={`step-res-${path._id}`}
          value={resourceId}
          onValueChange={setResourceId}
          placeholder={t('stepNoResource')}
          emptyLabel={t('stepNoResource')}
          options={resources.map((r) => ({ value: r._id, label: r.title }))}
          searchLabel={t('stepResourceSearchLabel')}
          searchPlaceholder={t('stepResourceSearchPlaceholder')}
          noResults={t('stepResourceNoResults')}
        />
        <TextField
          label={t('stepUrl')}
          id={`step-url-${path._id}`}
          hint={t('stepUrlHint')}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <TextField
          label={t('stepNote')}
          id={`step-note-${path._id}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="sm:col-span-2">
          <Button type="submit" size="sm" className="min-h-11">
            {t('addStep')}
          </Button>
        </div>
      </form>
    </li>
  );
}

function PathEditor({
  path,
  onDone,
}: {
  path: AdminPath | null;
  onDone: () => void;
}) {
  const t = useTranslations('toolbox');
  const tl = useTranslations('library');
  const save = useMutation(api.toolbox.savePath);
  const notify = useActionFeedback();
  const errorMessage = useProgrammeError();
  const [title, setTitle] = useState(path?.title ?? '');
  const [summary, setSummary] = useState(path?.summary ?? '');
  const [language, setLanguage] = useState<string>(path?.language ?? 'fr');
  const [level, setLevel] = useState<Level>(path?.level ?? 'debutant');
  const [themes, setThemes] = useState<string[]>(path?.themes ?? []);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      noValidate
      className="grid gap-4 rounded-md border border-accent-edge bg-surface p-5 sm:grid-cols-2"
      aria-label={path ? t('edit') : t('newPath')}
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await save({
            pathId: path?._id,
            title,
            summary,
            language: language as SiteLocale,
            level,
            themes,
          });
          notify(t('saved', { title: title.trim() }));
          onDone();
        } catch (err) {
          setError(errorMessage(err));
        }
      }}
    >
      <TextField
        label={t('fieldTitle')}
        id="path-title"
        className="sm:col-span-2"
        required
        maxLength={PROGRAMME_LIMITS.shortText}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <TextareaField
        label={t('fieldSummary')}
        id="path-summary"
        className="sm:col-span-2"
        rows={3}
        required
        maxLength={FIELD_MAX.body}
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
      />
      <SelectField
        label={t('filterLanguage')}
        id="path-lang"
        value={language}
        onValueChange={setLanguage}
        options={PROGRAMME_LANGUAGES.map((k) => ({
          value: k,
          label: vocabulary(tl, 'langs.', k),
        }))}
      />
      <SelectField
        label={t('filterLevel')}
        id="path-level"
        value={level}
        onValueChange={(v) => setLevel(v as Level)}
        options={LEVELS.map((k) => ({
          value: k,
          label: vocabulary(t, 'level_', k),
        }))}
      />
      <CheckGroup
        className="sm:col-span-2"
        legend={t('filterTheme')}
        options={PROGRAMME_THEMES.map((s) => ({
          value: s,
          label: vocabulary(tl, 'themes.', s),
        }))}
        value={themes}
        onChange={setThemes}
      />
      <FormError className="sm:col-span-2">{error}</FormError>
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        <Button type="submit">{t('save')}</Button>
        <Button type="button" variant="outline" onClick={onDone}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}
