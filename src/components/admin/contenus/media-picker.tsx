'use client';

import { useId, useState } from 'react';
import Image from 'next/image';
import { useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { resolveLocale } from '@/i18n/locale';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';

// SÉLECTEUR DE MÉDIA (F-64) — réutiliser une image de la médiathèque comme
// logo, visuel ou vignette, plutôt que de la téléverser à chaque contenu.
//
// Seules les IMAGES sont proposées : un logo PDF ne s'affiche pas. Le texte
// alternatif vient avec le média — il a été exigé au téléversement, il n'est
// pas à ressaisir ici. Panneau en ligne (pas de fenêtre modale) : il s'ouvre
// sous le champ, se parcourt au clavier dans l'ordre du document, et se
// referme au choix.
export function MediaPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Id<'contentMedia'> | undefined;
  onChange: (id: Id<'contentMedia'> | undefined) => void;
}) {
  const t = useTranslations('contentAdmin');
  const locale = resolveLocale(useLocale());
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const labelId = useId();
  const current = useQuery(
    api.contenus.media.get,
    value ? { id: value, locale } : 'skip',
  );
  const list = useQuery(
    api.contenus.media.list,
    open ? { locale, kind: 'image', search: search || undefined } : 'skip',
  );

  return (
    <div role="group" aria-labelledby={labelId}>
      <span id={labelId} className="block text-sm text-ink-soft">
        {label}
      </span>
      <div className="mt-1 flex flex-wrap items-center gap-3 rounded-sm border border-line bg-surface p-3">
        {value && current?.url ? (
          <>
            <Image
              src={current.url}
              alt={current.altText}
              width={current.width ?? 96}
              height={current.height ?? 64}
              unoptimized
              className="h-14 w-auto max-w-[140px] rounded-sm object-contain"
            />
            <span className="min-w-0 flex-1 text-sm text-ink wrap-anywhere">
              {current.filename}
              <span className="block text-[12px] text-muted">
                {current.altText}
              </span>
            </span>
          </>
        ) : (
          <span className="flex-1 text-sm text-muted">{t('md_none')}</span>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {t('md_pick')}
          </Button>
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11"
              onClick={() => onChange(undefined)}
            >
              {t('md_remove')}
            </Button>
          ) : null}
        </div>
      </div>

      {open ? (
        <div className="mt-2 rounded-sm border border-line bg-paper p-3">
          <TextField
            label={t('md_search')}
            type="search"
            value={search}
            placeholder={t('md_searchPlaceholder')}
            onChange={(e) => setSearch(e.target.value)}
          />
          {list === undefined ? (
            <p className="mt-3 text-sm text-muted">{t('loading')}</p>
          ) : list.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{t('md_empty')}</p>
          ) : (
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {list.map((m) => (
                <li key={m._id}>
                  <button
                    type="button"
                    aria-pressed={value === m._id}
                    onClick={() => {
                      onChange(m._id);
                      setOpen(false);
                    }}
                    className="flex h-full min-h-11 w-full flex-col items-center gap-1 rounded-sm border border-line bg-surface p-2 text-center text-[12px] text-ink-soft transition-colors hover:border-ink aria-pressed:border-accent-edge aria-pressed:bg-accent-tint"
                  >
                    {m.url ? (
                      <Image
                        src={m.url}
                        alt=""
                        width={m.width ?? 96}
                        height={m.height ?? 64}
                        unoptimized
                        className="h-12 w-auto max-w-full object-contain"
                      />
                    ) : null}
                    <span className="w-full wrap-anywhere">
                      <span className="sr-only">
                        {t('md_select', { name: m.filename })} —{' '}
                      </span>
                      {m.altText}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
