'use client';

import { useState, type FormEvent } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Link } from '@/i18n/navigation';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { TextareaField } from '@/components/ui/field';
import { isMember } from '@/lib/roles';

type WorkspaceDetail = {
  _id: Id<'workspaces'>;
  title: string;
  theme: string;
  description: string;
  ownerName: string;
  memberCount: number;
  createdAt: number;
  isMember: boolean;
  isOwner: boolean;
  members: {
    _id: Id<'workspaceMembers'>;
    userName: string;
    role: 'owner' | 'member';
    joinedAt: number;
  }[];
  notes: {
    _id: Id<'workspaceNotes'>;
    authorName: string;
    body: string;
    createdAt: number;
  }[];
};

// Formulaire de note (réservé aux membres DE L'ESPACE). Réplique le motif du
// CommentForm de la Tribune.
function NoteForm({ workspaceId }: { workspaceId: Id<'workspaces'> }) {
  const t = useTranslations('workspaces');
  const add = useMutation(api.workspaces.addNote);
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (body.trim().length < 2) return;
    setPending(true);
    try {
      await add({ workspaceId, body: body.trim() });
      setBody('');
    } catch {
      /* refusé (rôle / appartenance / rate-limit) : on n'insiste pas */
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-2">
      <TextareaField
        label={t('noteLabel')}
        labelHidden
        id="ws-note"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        required
        placeholder={t('notePlaceholder')}
      />
      <Button type="submit" size="sm" disabled={pending}>
        {t('noteSubmit')}
      </Button>
    </form>
  );
}

// Détail d'un espace : description, membres, rejoindre/quitter, fil de notes.
// Monté uniquement pour un membre réseau connecté (gating amont dans la page).
export function WorkspaceDetail({
  workspaceId,
}: {
  workspaceId: Id<'workspaces'>;
}) {
  const t = useTranslations('workspaces');
  const tl = useTranslations('library');
  const locale = useLocale();
  const me = useQuery(api.users.current);
  const data = useQuery(api.workspaces.getWorkspace, { workspaceId });
  const join = useMutation(api.workspaces.joinWorkspace);
  const leave = useMutation(api.workspaces.leaveWorkspace);
  const [pending, setPending] = useState(false);

  const fmtDate = (ms: number) =>
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(ms);

  // Garde de rôle (membre réseau). Le compte connecté mais non membre voit le
  // même message que sur la liste.
  if (me !== undefined && !isMember(me?.role)) {
    return (
      <div className="mx-auto max-w-[760px] px-4 py-16 sm:px-6">
        <section
          id="workspaces-members-only"
          className="rounded-md border border-accent-edge bg-accent-tint p-6"
        >
          <h2 className="font-display text-xl text-ink">
            {t('membersOnlyTitle')}
          </h2>
          <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-ink-soft">
            {t('membersOnlyBody')}
          </p>
          <Button asChild className="mt-4">
            <Link href="/adhesion">{t('membersOnlyCta')}</Link>
          </Button>
        </section>
      </div>
    );
  }

  if (data === undefined || me === undefined) {
    return (
      <div className="mx-auto max-w-[760px] px-4 py-16 text-ink-soft sm:px-6">
        {t('loading')}
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="mx-auto max-w-[760px] px-4 py-16 sm:px-6">
        <p className="text-ink-soft">{t('notFound')}</p>
        <Link
          href="/espaces"
          className="mt-4 inline-block text-sm font-medium text-accent-text hover:underline"
        >
          ← {t('back')}
        </Link>
      </div>
    );
  }

  async function onJoin() {
    setPending(true);
    try {
      await join({ workspaceId });
    } catch {
      /* sans incidence : l'état réactif reflètera l'échec éventuel */
    } finally {
      setPending(false);
    }
  }
  async function onLeave() {
    setPending(true);
    try {
      await leave({ workspaceId });
    } catch {
      /* owner ne peut pas quitter, etc. */
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="mx-auto max-w-[820px] px-4 py-12 sm:px-6 md:py-16">
      <Reveal>
        <p className="text-[13px] text-muted">
          <Link href="/" className="text-muted hover:text-ink">
            {t('home')}
          </Link>{' '}
          /{' '}
          <Link href="/espaces" className="text-muted hover:text-ink">
            {t('title')}
          </Link>
        </p>
      </Reveal>

      <header className="mt-4 border-b border-line pb-6">
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="rounded-pill border border-accent-edge bg-accent-tint px-2.5 py-0.5 font-medium text-accent-text">
            {tl(`themes.${data.theme}`)}
          </span>
          <span className="font-mono uppercase tracking-[0.06em] text-muted">
            {t('memberCount', { count: data.memberCount })}
          </span>
        </div>
        <h1 className="mt-3 font-display text-[clamp(26px,3.6vw,40px)] font-medium leading-[1.1] tracking-[-0.015em]">
          {data.title}
        </h1>
        <p className="mt-3 font-mono text-[11px] text-muted">
          {t('ownerLabel')} {data.ownerName} · {fmtDate(data.createdAt)}
        </p>
      </header>

      <p className="mt-6 whitespace-pre-line text-[17px] leading-relaxed text-ink-soft">
        {data.description}
      </p>

      {/* Rejoindre / Quitter */}
      <div className="mt-6">
        {data.isOwner ? (
          <p className="text-sm text-muted">{t('ownerCannotLeave')}</p>
        ) : data.isMember ? (
          <Button variant="outline" onClick={onLeave} disabled={pending}>
            {t('leave')}
          </Button>
        ) : (
          <Button onClick={onJoin} disabled={pending}>
            {t('join')}
          </Button>
        )}
      </div>

      {/* Membres */}
      <section className="mt-12 border-t border-line pt-8">
        <h2 className="font-display text-2xl">{t('membersTitle')}</h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {data.members.map((m) => (
            <li
              key={m._id}
              className="flex items-center gap-2 rounded-pill border border-line bg-surface px-3 py-1.5 text-sm"
            >
              <span className="text-ink">{m.userName}</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                {m.role === 'owner' ? t('roleOwner') : t('roleMember')}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Notes partagées */}
      <section className="mt-12 border-t border-line pt-8">
        <h2 className="font-display text-2xl">
          {t('notesCount', { count: data.notes.length })}
        </h2>

        {data.notes.length > 0 ? (
          <ul className="mt-5 flex flex-col gap-4">
            {data.notes.map((n) => (
              <li
                key={n._id}
                className="rounded-md border border-line bg-surface p-4"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted">
                  <span className="text-ink">{n.authorName}</span>
                  <span aria-hidden="true">·</span>
                  <span>{fmtDate(n.createdAt)}</span>
                </div>
                <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-ink">
                  {n.body}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-ink-soft">{t('noNotes')}</p>
        )}

        {data.isMember ? (
          <NoteForm workspaceId={workspaceId} />
        ) : (
          <p className="mt-5 text-sm text-ink-soft">{t('noteJoinPrompt')}</p>
        )}
      </section>
    </article>
  );
}
