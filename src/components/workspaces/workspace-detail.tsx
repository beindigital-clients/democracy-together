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
import { vocabulary } from '@/i18n/vocabulary';
import { ArrowBack } from '@/components/ui/arrow';
import { intlLocale } from '@/i18n/locale';
import { WorkspaceFiles } from './workspace-files';
import { WorkspaceManage, useRoleLabel } from './workspace-manage';
import { MyInvitations } from './workspace-invitations';
import { useWorkspaceError } from './workspace-errors';

// Note form (reserved for members OF THE WORKSPACE). Replicates the pattern of
// the Tribune's CommentForm.
// Same number as `convex/workspaces.ts#addNote` (INVALID_NOTE beyond it).
const NOTE_MAX = 4000;

function NoteForm({ workspaceId }: { workspaceId: Id<'workspaces'> }) {
  const t = useTranslations('workspaces');
  const add = useMutation(api.workspaces.addNote);
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (body.trim().length < 2) return;
    // Server limit (`addNote`: INVALID_NOTE beyond it). Without this message, a
    // note that was too long vanished without a word — the rejection was caught and swallowed.
    if (body.trim().length > NOTE_MAX) {
      setError(t('errNote', { max: NOTE_MAX }));
      return;
    }
    setPending(true);
    try {
      await add({ workspaceId, body: body.trim() });
      setBody('');
    } catch {
      // Rejected (role / membership / rate-limit / limit): the text stays, and
      // the author knows nothing was sent.
      setError(t('errGeneric'));
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
        maxLength={NOTE_MAX}
        placeholder={t('notePlaceholder')}
      />
      {error ? (
        <p role="alert" className="text-sm text-bar-5">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="sm" disabled={pending}>
        {t('noteSubmit')}
      </Button>
    </form>
  );
}

// Workspace detail: description, members, join/leave, notes feed.
// Mounted only for a signed-in network member (gating upstream in the page).
export function WorkspaceDetail({
  workspaceId,
}: {
  workspaceId: Id<'workspaces'>;
}) {
  const t = useTranslations('workspaces');
  const tl = useTranslations('library');
  const locale = useLocale();
  const me = useQuery(api.users.current);
  // Same guard as the list: the query is only issued once the role is
  // known and sufficient (see workspaces-board.tsx). A malformed or
  // foreign identifier is absorbed by the server, which returns `null` -> "not found".
  const data = useQuery(
    api.workspaces.getWorkspace,
    me !== undefined && isMember(me?.role) ? { workspaceId } : 'skip',
  );
  const join = useMutation(api.workspaces.joinWorkspace);
  const leave = useMutation(api.workspaces.leaveWorkspace);
  const roleLabel = useRoleLabel();
  const errorMessage = useWorkspaceError();
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fmtDate = (ms: number) =>
    new Intl.DateTimeFormat(intlLocale(locale), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(ms);

  // Role guard (network member). A signed-in account that is not a member sees the
  // same message as on the list.
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
          <ArrowBack /> {t('back')}
        </Link>
      </div>
    );
  }

  // Rejections (private workspace, last facilitator…) are STATED: a button that
  // does nothing without explanation is the defect the campaign flagged.
  async function onJoin() {
    setPending(true);
    setActionError(null);
    try {
      await join({ workspaceId });
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }
  async function onLeave() {
    setPending(true);
    setActionError(null);
    try {
      await leave({ workspaceId });
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  const canWrite =
    data.myRole === 'animateur' || data.myRole === 'contributeur';

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
            {vocabulary(tl, 'themes.', data.theme)}
          </span>
          <span className="font-mono uppercase tracking-[0.06em] text-muted">
            {t('memberCount', { count: data.memberCount })}
          </span>
          <span className="rounded-pill border border-line-strong bg-surface-2 px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
            {data.visibility === 'private' ? t('privateBadge') : t('openBadge')}
          </span>
          {data.myRole ? (
            <span className="font-mono text-[11px] text-muted">
              {t('yourRole', { role: roleLabel(data.myRole) })}
            </span>
          ) : null}
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

      {/* Join / Leave. A private workspace cannot be joined: one
          enters it by accepting the invitation, shown here. */}
      <div className="mt-6">
        {data.isLastAnimator ? (
          <p className="text-sm text-muted">{t('ownerCannotLeave')}</p>
        ) : data.isMember ? (
          <Button
            variant="outline"
            className="min-h-11"
            onClick={onLeave}
            disabled={pending}
          >
            {t('leave')}
          </Button>
        ) : data.visibility === 'private' ? (
          <MyInvitations workspaceId={workspaceId} />
        ) : (
          <Button className="min-h-11" onClick={onJoin} disabled={pending}>
            {t('join')}
          </Button>
        )}
        {actionError ? (
          <p role="alert" className="mt-2 text-sm text-bar-5">
            {actionError}
          </p>
        ) : null}
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
              <span className="wrap-anywhere text-ink">{m.userName}</span>
              <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                {roleLabel(m.role)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Shared notes — the server only returns them to workspace members
          (R-11): for others, the title stays generic (the number of
          notes is not known) and the invitation to join replaces the feed. */}
      <section className="mt-12 border-t border-line pt-8">
        <h2 className="font-display text-2xl">
          {data.isMember
            ? t('notesCount', { count: data.notes.length })
            : t('notesTitle')}
        </h2>

        {!data.isMember ? (
          <p className="mt-4 text-sm text-ink-soft">{t('notesJoinToRead')}</p>
        ) : data.notes.length > 0 ? (
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
                <p className="mt-2 whitespace-pre-line wrap-anywhere text-[15px] leading-relaxed text-ink">
                  {n.body}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-ink-soft">{t('noNotes')}</p>
        )}

        {canWrite ? (
          <NoteForm workspaceId={workspaceId} />
        ) : data.isMember ? (
          <p className="mt-5 text-sm text-ink-soft">{t('notesReadOnly')}</p>
        ) : (
          <p className="mt-5 text-sm text-ink-soft">{t('noteJoinPrompt')}</p>
        )}
      </section>

      {/* Shared files: workspace members only. */}
      {data.isMember ? (
        <WorkspaceFiles
          workspaceId={workspaceId}
          canUpload={canWrite}
          storageBytes={data.storageBytes}
          quotaBytes={data.quotaBytes}
        />
      ) : null}

      {/* Facilitation: facilitators only. */}
      {data.myRole === 'animateur' ? (
        <WorkspaceManage
          workspaceId={workspaceId}
          visibility={data.visibility}
          members={data.members}
          invitations={data.invitations}
        />
      ) : null}
    </article>
  );
}
