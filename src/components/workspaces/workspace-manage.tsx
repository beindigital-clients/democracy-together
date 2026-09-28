'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import type { WorkspaceRole } from '@convex/lib/communaute';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SelectField, TextField } from '@/components/ui/field';
import { intlLocale } from '@/i18n/locale';
import { useWorkspaceError } from './workspace-errors';

type Member = {
  _id: Id<'workspaceMembers'>;
  userName: string;
  role: WorkspaceRole;
  isSelf: boolean;
};

type Invitation = {
  _id: Id<'workspaceInvitations'>;
  email: string;
  role: WorkspaceRole;
  expiresAt: number;
};

// Label for a role — keys written in full (issue #33 guard).
export function useRoleLabel() {
  const t = useTranslations('workspaces');
  return (role: WorkspaceRole) =>
    role === 'animateur'
      ? t('role_animateur')
      : role === 'contributeur'
        ? t('role_contributeur')
        : t('role_lecteur');
}

function RoleOptions() {
  const label = useRoleLabel();
  return (
    <>
      <option value="contributeur">{label('contributeur')}</option>
      <option value="lecteur">{label('lecteur')}</option>
      <option value="animateur">{label('animateur')}</option>
    </>
  );
}

// WORKSPACE FACILITATION (F-24): invite (by address or from the list of
// people one already shares a workspace with), track and revoke
// invitations, change a role, remove a member, open or close the workspace.
// Mounted for facilitators only; each action is re-checked in
// Convex (`requireWorkspaceRole`).
export function WorkspaceManage({
  workspaceId,
  visibility,
  members,
  invitations,
}: {
  workspaceId: Id<'workspaces'>;
  visibility: 'open' | 'private';
  members: Member[];
  invitations: Invitation[];
}) {
  const t = useTranslations('workspaces');
  const roleLabel = useRoleLabel();
  const locale = intlLocale(useLocale());
  const errorMessage = useWorkspaceError();
  const invite = useMutation(api.workspaces.inviteMember);
  const revoke = useMutation(api.workspaces.revokeInvitation);
  const setRole = useMutation(api.workspaces.setMemberRole);
  const removeMember = useMutation(api.workspaces.removeMember);
  const setVisibility = useMutation(api.workspaces.setVisibility);
  const candidates = useQuery(api.workspaces.inviteCandidates, {
    workspaceId,
  });

  const [email, setEmail] = useState('');
  const [role, setRoleChoice] = useState<WorkspaceRole>('contributeur');
  const [candidate, setCandidate] = useState('');
  const [candidateRole, setCandidateRole] =
    useState<WorkspaceRole>('contributeur');
  const [draftRoles, setDraftRoles] = useState<Record<string, WorkspaceRole>>(
    {},
  );
  const [removing, setRemoving] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const fmtDate = (ms: number) =>
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(ms);

  async function run(action: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await action();
      setStatus(ok);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onInvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) {
      setError(t('errInvalidEmail'));
      return;
    }
    // Same message whether or not the address matches an account: the
    // server doesn't say, and neither does the screen.
    if (
      await run(
        () => invite({ workspaceId, email: email.trim(), role }),
        t('inviteSent', { email: email.trim() }),
      )
    ) {
      setEmail('');
    }
  }

  async function onInviteCandidate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!candidate) return;
    const name = candidates?.find((c) => c.userId === candidate)?.name ?? '';
    if (
      await run(
        () =>
          invite({
            workspaceId,
            userId: candidate as Id<'users'>,
            role: candidateRole,
          }),
        t('inviteSent', { email: name }),
      )
    ) {
      setCandidate('');
    }
  }

  return (
    <section
      aria-labelledby="ws-manage-title"
      className="mt-12 border-t border-line pt-8"
    >
      <h2 id="ws-manage-title" className="font-display text-2xl">
        {t('manageTitle')}
      </h2>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-bar-5">
          {error}
        </p>
      ) : null}
      {status ? (
        <p role="status" className="mt-3 text-sm text-ink">
          {status}
        </p>
      ) : null}

      {/* Open / private */}
      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface p-4">
        <p className="flex-1 text-sm text-ink-soft">
          {visibility === 'private'
            ? t('visibilityPrivateNow')
            : t('visibilityOpenNow')}
        </p>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={busy}
          onClick={() =>
            run(
              () =>
                setVisibility({
                  workspaceId,
                  visibility: visibility === 'private' ? 'open' : 'private',
                }),
              visibility === 'private'
                ? t('visibilityOpened')
                : t('visibilityClosed'),
            )
          }
        >
          {visibility === 'private' ? t('makeOpen') : t('makePrivate')}
        </Button>
      </div>

      {/* Invite by address */}
      <form
        onSubmit={onInvite}
        noValidate
        className="mt-5 grid gap-3 rounded-md border border-line bg-surface p-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end"
      >
        <TextField
          label={t('inviteEmail')}
          id="ws-invite-email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          hint={t('inviteEmailHint')}
        />
        <SelectField
          label={t('inviteRole')}
          id="ws-invite-role"
          value={role}
          onChange={(e) => setRoleChoice(e.target.value as WorkspaceRole)}
        >
          <RoleOptions />
        </SelectField>
        <Button type="submit" className="min-h-11" disabled={busy}>
          {t('inviteSubmit')}
        </Button>
      </form>

      {/* Invite from the list */}
      {candidates && candidates.length > 0 ? (
        <form
          onSubmit={onInviteCandidate}
          className="mt-3 grid gap-3 rounded-md border border-line bg-surface p-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end"
        >
          <SelectField
            label={t('inviteFromList')}
            id="ws-invite-candidate"
            value={candidate}
            hint={t('inviteFromListHint')}
            onChange={(e) => setCandidate(e.target.value)}
          >
            <option value="">{t('inviteChoose')}</option>
            {candidates.map((c) => (
              <option key={c.userId} value={c.userId}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t('inviteRole')}
            id="ws-invite-candidate-role"
            value={candidateRole}
            onChange={(e) => setCandidateRole(e.target.value as WorkspaceRole)}
          >
            <RoleOptions />
          </SelectField>
          <Button
            type="submit"
            className="min-h-11"
            disabled={busy || !candidate}
          >
            {t('inviteSubmit')}
          </Button>
        </form>
      ) : null}

      {/* Pending invitations */}
      <h3 className="mt-8 font-display text-lg">{t('pendingInvitations')}</h3>
      {invitations.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">
          {t('noPendingInvitations')}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-line rounded-md border border-line bg-surface">
          {invitations.map((i) => (
            <li
              key={i._id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
            >
              <span className="wrap-anywhere text-sm text-ink">{i.email}</span>
              <span className="font-mono text-[11px] text-muted">
                {roleLabel(i.role)} ·{' '}
                {t('invitationExpires', { date: fmtDate(i.expiresAt) })}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-11"
                disabled={busy}
                onClick={() =>
                  run(
                    () => revoke({ invitationId: i._id }),
                    t('inviteRevoked', { email: i.email }),
                  )
                }
              >
                {t('inviteRevoke')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Roles and removal */}
      <h3 className="mt-8 font-display text-lg">{t('manageMembers')}</h3>
      <ul className="mt-3 flex flex-col divide-y divide-line rounded-md border border-line bg-surface">
        {members
          .filter((m) => !m.isSelf)
          .map((m) => {
            const draft = draftRoles[m._id] ?? m.role;
            return (
              <li
                key={m._id}
                className="flex flex-wrap items-end justify-between gap-3 px-4 py-3"
              >
                <span className="wrap-anywhere min-w-[10ch] flex-1 text-sm text-ink">
                  {m.userName}
                </span>
                <SelectField
                  label={t('memberRoleFor', { name: m.userName })}
                  labelHidden
                  id={`ws-role-${m._id}`}
                  value={draft}
                  onChange={(e) =>
                    setDraftRoles((d) => ({
                      ...d,
                      [m._id]: e.target.value as WorkspaceRole,
                    }))
                  }
                >
                  <RoleOptions />
                </SelectField>
                {/* Choosing is not applying (same pattern as the
                    back-office, issue #38). */}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  disabled={busy || draft === m.role}
                  onClick={() =>
                    run(
                      () => setRole({ memberId: m._id, role: draft }),
                      t('roleChanged', {
                        name: m.userName,
                        role: roleLabel(draft),
                      }),
                    )
                  }
                >
                  {t('applyRole')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  disabled={busy}
                  onClick={() => setRemoving(m)}
                  aria-label={t('removeMemberNamed', { name: m.userName })}
                >
                  {t('removeMember')}
                </Button>
              </li>
            );
          })}
      </ul>

      <ConfirmDialog
        open={removing !== null}
        title={t('removeConfirmTitle', { name: removing?.userName ?? '' })}
        description={t('removeConfirmBody')}
        confirmLabel={t('removeMember')}
        cancelLabel={t('cancel')}
        destructive
        pending={busy}
        onConfirm={async () => {
          if (!removing) return;
          await run(
            () => removeMember({ memberId: removing._id }),
            t('memberRemoved', { name: removing.userName }),
          );
          setRemoving(null);
        }}
        onCancel={() => setRemoving(null)}
      />
    </section>
  );
}
