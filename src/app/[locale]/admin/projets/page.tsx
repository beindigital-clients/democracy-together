'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// File de revue des propositions de projets collaboratifs (F-60). Modérateur+.
export default function AdminProjects() {
  const t = useTranslations('admin');
  const tl = useTranslations('library');
  const locale = useLocale();
  const [pendingOnly, setPendingOnly] = useState(true);
  const proposals = useQuery(api.projects.listProjectProposals, {
    status: pendingOnly ? 'pending' : undefined,
  });
  const review = useMutation(api.projects.reviewProjectProposal);
  const reopen = useMutation(api.projects.reopenProjectProposal);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const fmt = (ms: number) =>
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(ms);

  async function decide(id: string, decision: 'accepted' | 'rejected') {
    setBusy(id);
    try {
      await review({
        proposalId: id as Id<'projectProposals'>,
        decision,
        notes: notes[id]?.trim() || undefined,
      });
    } catch {
      /* erreur silencieuse : la liste se rafraîchit toute seule */
    } finally {
      setBusy(null);
    }
  }

  // Revenir sur une décision demande de ROUVRIR la proposition (issue #9) : le
  // serveur refuse qu'on la retranche directement, et la réouverture laisse sa
  // propre trace au journal.
  async function reopenProposal(id: string) {
    setBusy(id);
    try {
      await reopen({ proposalId: id as Id<'projectProposals'> });
    } catch {
      /* idem */
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">{t('prjTitle')}</h1>
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

      {proposals === undefined ? (
        <p className="mt-4 text-ink-soft">{t('loading')}</p>
      ) : proposals.length === 0 ? (
        <p className="mt-4 text-ink-soft">{t('prjEmpty')}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {proposals.map((p) => (
            <li
              key={p._id}
              className="rounded-md border border-line bg-surface p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-medium text-ink">{p.title}</h2>
                <Badge variant="default">{t(`prjStatus_${p.status}`)}</Badge>
                <span className="font-mono text-[11px] text-muted">
                  {fmt(p.createdAt)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-[13px] text-ink-soft">
                <span>{p.authorName}</span>
                <span className="text-accent-text">
                  #{tl(`themes.${p.theme}`)}
                </span>
              </div>
              <p className="mt-2 text-[14px] leading-relaxed text-ink">
                {p.summary}
              </p>
              {p.reviewNotes ? (
                <p className="mt-2 text-[13px] text-muted">
                  {t('prjNotesLabel')} {p.reviewNotes}
                </p>
              ) : null}

              {p.status === 'pending' ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Input
                    value={notes[p._id] ?? ''}
                    onChange={(e) =>
                      setNotes((n) => ({ ...n, [p._id]: e.target.value }))
                    }
                    placeholder={t('prjNotesPlaceholder')}
                    className="max-w-xs"
                  />
                  <span className="flex-1" />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === p._id}
                    onClick={() => decide(p._id, 'rejected')}
                  >
                    {t('prjReject')}
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy === p._id}
                    onClick={() => decide(p._id, 'accepted')}
                  >
                    {t('prjAccept')}
                  </Button>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="flex-1" />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === p._id}
                    onClick={() => reopenProposal(p._id)}
                  >
                    {t('reopen')}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
