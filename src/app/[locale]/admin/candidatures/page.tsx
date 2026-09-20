'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Doc } from '@convex/_generated/dataModel';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DirectoryFields,
  type DirectoryDraft,
} from '@/components/admin/directory-fields';
import { vocabulary } from '@/i18n/vocabulary';

function ApplicationRow({ app }: { app: Doc<'membershipApplications'> }) {
  const t = useTranslations('admin');
  const review = useMutation(api.organizations.reviewApplication);
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState(false);
  // Approuver une ORGANISATION ouvre la saisie de la fiche annuaire : c'est à
  // ce moment que l'organisation est créée (F-19/F-22).
  const [showDirectory, setShowDirectory] = useState(false);

  async function decide(
    decision: 'approved' | 'rejected',
    directory?: DirectoryDraft,
  ) {
    setPending(true);
    try {
      await review({
        applicationId: app._id,
        decision,
        notes: notes.trim() || undefined,
        ...(directory ? { directory } : {}),
      });
      setShowDirectory(false);
    } catch {
      // action refusée côté serveur (ex. rôle insuffisant) : la file reste
      // inchangée, pas de rejet non géré.
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="rounded-md border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg">{app.organizationName}</h2>
            <Badge>{vocabulary(t, 'appType_', app.type)}</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            {app.contactEmail} · {app.country}
          </p>
        </div>
        <Badge variant={app.status === 'pending' ? 'accent' : 'default'}>
          {vocabulary(t, 'status_', app.status)}
        </Badge>
      </div>

      {app.message ? (
        <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-ink-soft">
          {app.message}
        </p>
      ) : null}

      {app.status === 'pending' ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('appNotesPlaceholder')}
            aria-label={`${t('appNotesPlaceholder')} ${app.organizationName}`}
            className="max-w-xs"
          />
          <Button
            onClick={() =>
              app.type === 'organisation'
                ? setShowDirectory(true)
                : decide('approved')
            }
            disabled={pending}
          >
            {t('approve')}
          </Button>
          <Button
            variant="outline"
            onClick={() => decide('rejected')}
            disabled={pending}
          >
            {t('reject')}
          </Button>
        </div>
      ) : app.reviewNotes ? (
        <p className="mt-3 text-xs text-muted">“{app.reviewNotes}”</p>
      ) : null}

      {app.status === 'pending' && showDirectory ? (
        <DirectoryFields
          organizationName={app.organizationName}
          pending={pending}
          onConfirm={(draft) => decide('approved', draft)}
          onApproveWithout={() => decide('approved')}
          onCancel={() => setShowDirectory(false)}
        />
      ) : null}
    </li>
  );
}

export default function AdminApplications() {
  const t = useTranslations('admin');
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const apps = useQuery(
    api.admin.listApplications,
    filter === 'pending' ? { status: 'pending' } : {},
  );

  return (
    <div>
      <h1 className="font-display text-3xl">{t('applications')}</h1>

      <div className="mt-5 flex gap-2">
        {(['pending', 'all'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f
                ? 'border-accent-edge bg-accent-tint text-accent-text'
                : 'border-line bg-surface-2 text-ink-soft hover:text-ink'
            }`}
          >
            {t(f === 'pending' ? 'filterPending' : 'filterAll')}
          </button>
        ))}
      </div>

      {apps === undefined ? (
        <p className="mt-6 text-ink-soft">{t('loading')}</p>
      ) : apps.length === 0 ? (
        <p className="mt-6 text-ink-soft">{t('noApplications')}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {apps.map((a) => (
            <ApplicationRow key={a._id} app={a} />
          ))}
        </ul>
      )}
    </div>
  );
}
