'use client';

import { useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import {
  LEVELS,
  PROGRAMME_LANGUAGES,
  PROGRAMME_THEMES,
  RESOURCE_KINDS,
} from '@convex/lib/programmes';
import { Link } from '@/i18n/navigation';
import { SelectField } from '@/components/ui/choice-fields';
import { vocabulary } from '@/i18n/vocabulary';
import { safeHref } from '@/lib/safe-href';
import { StatusPill } from '@/components/programmes/shared';

export type Resource = FunctionReturnType<
  typeof api.toolbox.listResources
>[number];

// Link for a resource: the file if there is one, otherwise the URL. An
// internal URL (`/replays/…`) stays within the site; an external URL
// opens separately, without passing on the referrer.
export function ResourceLink({ resource }: { resource: Resource }) {
  const t = useTranslations('toolbox');
  const cls =
    'inline-flex min-h-11 items-center text-sm font-medium text-accent-text hover:underline';
  if (resource.fileUrl)
    return (
      <a
        href={resource.fileUrl}
        className={cls}
        download={resource.fileName ?? undefined}
      >
        {t('download')}
      </a>
    );
  if (resource.url?.startsWith('/'))
    return (
      <Link href={resource.url} className={cls}>
        {t('open')}
      </Link>
    );
  const href = resource.url ? safeHref(resource.url) : null;
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {t('openExternal')}
    </a>
  );
}

export function ResourceCard({ resource }: { resource: Resource }) {
  const t = useTranslations('toolbox');
  const tl = useTranslations('library');
  return (
    <li className="flex flex-col rounded-md border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone="neutral">
          {vocabulary(t, 'kind_', resource.kind)}
        </StatusPill>
        <span className="text-[12px] text-muted">
          {vocabulary(t, 'level_', resource.level)} ·{' '}
          {vocabulary(tl, 'langs.', resource.language)}
        </span>
      </div>
      <h3 className="mt-3 wrap-anywhere font-display text-lg leading-tight">
        {resource.title}
      </h3>
      <p className="mt-2 flex-1 wrap-anywhere text-[14px] leading-relaxed text-ink-soft">
        {resource.summary}
      </p>
      {resource.themes.length ? (
        <p className="mt-2 text-[13px] text-accent-text">
          {resource.themes.map((s) => vocabulary(tl, 'themes.', s)).join(' · ')}
        </p>
      ) : null}
      <div className="mt-2">
        <ResourceLink resource={resource} />
      </div>
    </li>
  );
}

// Filterable toolbox catalogue (F-56).
export function ToolboxCatalog() {
  const t = useTranslations('toolbox');
  const tl = useTranslations('library');
  const resources = useQuery(api.toolbox.listResources);
  const [kind, setKind] = useState('');
  const [theme, setTheme] = useState('');
  const [language, setLanguage] = useState('');
  const [level, setLevel] = useState('');
  const shown = useMemo(
    () =>
      (resources ?? []).filter(
        (r) =>
          (!kind || r.kind === kind) &&
          (!theme || r.themes.includes(theme)) &&
          (!language || r.language === language) &&
          (!level || r.level === level),
      ),
    [resources, kind, theme, language, level],
  );
  const filters = [
    {
      id: 'tb-kind',
      label: t('filterKind'),
      value: kind,
      set: setKind,
      options: RESOURCE_KINDS.map((k) => [k, vocabulary(t, 'kind_', k)]),
    },
    {
      id: 'tb-theme',
      label: t('filterTheme'),
      value: theme,
      set: setTheme,
      options: PROGRAMME_THEMES.map((k) => [k, vocabulary(tl, 'themes.', k)]),
    },
    {
      id: 'tb-lang',
      label: t('filterLanguage'),
      value: language,
      set: setLanguage,
      options: PROGRAMME_LANGUAGES.map((k) => [k, vocabulary(tl, 'langs.', k)]),
    },
    {
      id: 'tb-level',
      label: t('filterLevel'),
      value: level,
      set: setLevel,
      options: LEVELS.map((k) => [k, vocabulary(t, 'level_', k)]),
    },
  ] as const;
  return (
    <div>
      <div
        role="search"
        aria-label={t('filtersLabel')}
        className="grid gap-3 rounded-md border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {filters.map((f) => (
          <SelectField
            key={f.id}
            id={f.id}
            label={f.label}
            value={f.value}
            onValueChange={f.set}
            emptyLabel={t('filterAll')}
            options={f.options.map(([value, label]) => ({ value, label }))}
          />
        ))}
      </div>
      {resources === undefined ? (
        <p className="mt-6 text-ink-soft">{t('loading')}</p>
      ) : (
        <>
          <p className="mt-4 text-[14px] text-muted" role="status">
            {t('count', { count: shown.length })}
          </p>
          {shown.length === 0 ? (
            <p className="mt-4 text-ink-soft">{t('empty')}</p>
          ) : (
            <ul className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {shown.map((r) => (
                <ResourceCard key={r._id} resource={r} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

// List of published learning paths (F-57).
export function PathList() {
  const t = useTranslations('toolbox');
  const tl = useTranslations('library');
  const paths = useQuery(api.toolbox.listPaths);
  if (paths === undefined)
    return <p className="text-ink-soft">{t('loading')}</p>;
  if (paths.length === 0)
    return <p className="text-ink-soft">{t('pathsEmpty')}</p>;
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {paths.map((p) => (
        <li
          key={p._id}
          className="rounded-md border border-line bg-surface p-5"
        >
          <p className="text-[12px] text-muted">
            {vocabulary(t, 'level_', p.level)} ·{' '}
            {vocabulary(tl, 'langs.', p.language)} ·{' '}
            {t('stepsCount', { count: p.steps })}
          </p>
          <h3 className="mt-2 wrap-anywhere font-display text-lg leading-tight">
            <Link href={`/parcours/${p.slug}`} className="hover:underline">
              {p.title}
            </Link>
          </h3>
          <p className="mt-2 wrap-anywhere text-[14px] text-ink-soft">
            {p.summary}
          </p>
        </li>
      ))}
    </ul>
  );
}
