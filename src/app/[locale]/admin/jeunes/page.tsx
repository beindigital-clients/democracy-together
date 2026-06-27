'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function AdminYouth() {
  const t = useTranslations('admin');
  const tl = useTranslations('library');
  const locale = useLocale();
  const [pendingOnly, setPendingOnly] = useState(true);
  const apps = useQuery(api.youth.listYouthApplications, {
    status: pendingOnly ? 'pending' : undefined,
  });
  const review = useMutation(api.youth.reviewYouthApplication);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const fmt = (ms: number) =>
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(ms);

  async function decide(id: string, decision: 'approved' | 'rejected') {
    setBusy(id);
    try {
      await review({
        applicationId: id as Id<'youthApplications'>,
        decision,
        notes: notes[id]?.trim() || undefined,
      });
    } catch {
      /* idem */
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">{t('yTitle')}</h1>
        <div className="flex gap-1 rounded-md border border-line p-0.5">
          <button
            type="button"
            onClick={() => setPendingOnly(true)}
            className={`rounded px-3 py-1 text-sm ${pendingOnly ? 'bg-surface-2 text-ink' : 'text-ink-soft'}`}
          >
            {t('filterPending')}
          </button>
          <button
            type="button"
            onClick={() => setPendingOnly(false)}
            className={`rounded px-3 py-1 text-sm ${!pendingOnly ? 'bg-surface-2 text-ink' : 'text-ink-soft'}`}
          >
            {t('filterAll')}
          </button>
        </div>
      </div>

      {apps === undefined ? (
        <p className="mt-4 text-ink-soft">{t('loading')}</p>
      ) : apps.length === 0 ? (
        <p className="mt-4 text-ink-soft">{t('yEmpty')}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {apps.map((a) => (
            <li
              key={a._id}
              className="rounded-md border border-line bg-surface p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-medium text-ink">{a.name}</h2>
                <Badge variant="default">{t(`status_${a.status}`)}</Badge>
                <span className="font-mono text-[11px] text-muted">
                  {fmt(a.createdAt)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-[13px] text-ink-soft">
                <a
                  href={`mailto:${a.email}`}
                  className="hover:text-ink hover:underline"
                >
                  {a.email}
                </a>
                <span>· {a.country}</span>
                {a.themes.map((th) => (
                  <span key={th} className="text-accent-text">
                    #{tl(`themes.${th}`)}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[14px] leading-relaxed text-ink">
                {a.motivation}
              </p>

              {a.status === 'pending' ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Input
                    value={notes[a._id] ?? ''}
                    onChange={(e) =>
                      setNotes((n) => ({ ...n, [a._id]: e.target.value }))
                    }
                    placeholder={t('appNotesPlaceholder')}
                    className="max-w-xs"
                  />
                  <span className="flex-1" />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === a._id}
                    onClick={() => decide(a._id, 'rejected')}
                  >
                    {t('reject')}
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy === a._id}
                    onClick={() => decide(a._id, 'approved')}
                  >
                    {t('approve')}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
