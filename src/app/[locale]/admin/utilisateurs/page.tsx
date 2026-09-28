'use client';

import { useState } from 'react';
import { useQuery, useMutation, usePaginatedQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { ROLE_ORDER, isAdmin, type NetworkRole } from '@/lib/roles';
import { SelectField } from '@/components/ui/field';
import { CreateAccountForm } from '@/components/admin/create-account-form';
import { AccountActions } from '@/components/admin/account-actions';
import { TwoFactorPolicyPanel } from '@/components/admin/two-factor-policy';
import { AdminSearch } from '@/components/admin/admin-search';
import { LoadMore } from '@/components/admin/load-more';
import { RoleSelector } from '@/components/admin/role-selector';
import {
  useActionFeedback,
  useFailureFeedback,
} from '@/components/admin/action-feedback';
import { vocabulary } from '@/i18n/vocabulary';
import { ScrollableRegion } from '@/components/ui/scrollable-region';
import { useConnu } from '@/hooks/use-connu';

// Page size. The server re-caps it: it is indicative.
const PAGE_SIZE = 50;

function UsersTable() {
  const t = useTranslations('admin');
  const ta = useTranslations('accounts');
  // PAGINATED (issue #8): the list loaded the entire `users` table. The order
  // (by email) now comes from the server-side index, not from a client sort.
  //
  // SERVER-SIDE SEARCH AND FILTER (issue #49): both are ARGUMENTS of the
  // paginated query, not a filter on the rendered table. Changing them restarts from a
  // first page — that is the intended behavior, and it is also the reason
  // why searching works: the row being searched for is generally not in
  // the already loaded page.
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<NetworkRole | ''>('');
  const {
    results: users,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.admin.listUsers,
    {
      ...(search ? { search } : {}),
      ...(role ? { role } : {}),
    },
    { initialNumItems: PAGE_SIZE },
  );
  // `useConnu`: a flicker of this query must not UNMOUNT the
  // table. It would take with it the confirmation dialog
  // open in a row — observed in CI, the "Changer le rôle" button
  // detached from the DOM while it was being clicked.
  const me = useConnu(useQuery(api.users.current));
  const setRole_ = useMutation(api.users.setRole);
  const notify = useActionFeedback();
  const fail = useFailureFeedback();

  // FREEZE THE LIST WHILE A CONFIRMATION IS OPEN.
  //
  // The confirmation dialog lives INSIDE a row: if the row disappears, the
  // dialog goes with it, mid-gesture. `useConnu` closed the first path
  // — the flicker of `users.current`. A second one remained, and CI
  // showed it: the search is DEBOUNCED, so typing then clicking
  // "Appliquer" right away lets the query fire while the dialog
  // is open. The query arguments change, `status` goes back to
  // `LoadingFirstPage`, the list empties, the confirmation vanishes.
  //
  // We therefore freeze the DISPLAYED rows for the duration of the confirmation. The window
  // is short and bounded by a user gesture: nothing can go
  // stale there for long, and the list comes back fresh as soon as it closes —
  // including after an accepted change, whose value then arrives.
  //
  // Only one dialog at a time: the overlay covers the screen and intercepts
  // clicks, so a boolean is enough where a counter would only serve to
  // describe an impossible situation.
  const [gel, setGel] = useState<typeof users | null>(null);
  const lignes = gel ?? users;
  function signalerConfirmation(ouverte: boolean) {
    setGel(ouverte ? users : null);
  }

  // Called from `RoleSelector`, hence AFTER "Appliquer" then confirmation
  // (issue #38): the scroll wheel over the dropdown no longer reaches
  // here. Returns `true` if the server accepted.
  async function changeRole(
    userId: string,
    name: string,
    next: NetworkRole,
  ): Promise<boolean> {
    try {
      // userId is an Id<'users'> on the API side; the cast remains safe (source = listUsers).
      await setRole_({ userId: userId as never, role: next });
      notify(
        t('feedbackRoleChanged', { name, role: vocabulary(t, 'role_', next) }),
      );
      return true;
    } catch (err) {
      // Server rejection (e.g. last admin / insufficient role): the screen SAYS so,
      // via the refusal reason, and the selector reverts to the actual value.
      fail(err);
      return false;
    }
  }

  const filtering = search !== '' || role !== '';

  return (
    <div className="mt-6">
      {/* The controls stay mounted during loading: otherwise the field
          would unmount under the user's fingers on every new search. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <AdminSearch
          label={t('searchUsersLabel')}
          placeholder={t('searchUsersPlaceholder')}
          value={search}
          onChange={setSearch}
          className="flex-1"
        />
        <SelectField
          label={t('filterRoleLabel')}
          labelHidden
          controlClassName="w-auto py-1.5"
          value={role}
          onChange={(e) => setRole(e.target.value as NetworkRole | '')}
        >
          <option value="">{t('filterRoleAll')}</option>
          {ROLE_ORDER.map((r) => (
            <option key={r} value={r}>
              {vocabulary(t, 'role_', r)}
            </option>
          ))}
        </SelectField>
      </div>

      {(status === 'LoadingFirstPage' && gel === null) || !me ? (
        <p className="mt-6 text-ink-soft">{t('loading')}</p>
      ) : lignes.length === 0 ? (
        <p className="mt-6 text-ink-soft">
          {filtering ? t('noResults') : t('noUsers')}
        </p>
      ) : (
        <ScrollableRegion label={t('users')} className="mt-6">
          <table className="w-full min-w-[860px] text-sm">
            {/* Table caption (RGAA 5.4): the screen's `<h1>` names it for
                the eye; the caption ties it to the table for speech synthesis. */}
            <caption className="sr-only">{t('users')}</caption>
            <thead>
              <tr className="border-b border-line text-start font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                {/* Pinned IDENTITY column: once the table was scrolled
                    to "Appliquer" on mobile, the address went off
                    screen and one confirmed a role without seeing for whom
                    (27/09, C-1). `bg-paper`: without a background, the other columns
                    would show through beneath it. */}
                <th className="sticky start-0 z-[1] bg-paper py-2 pe-4 font-normal">
                  {t('userEmail')}
                </th>
                <th className="py-2 pe-4 font-normal">{t('userName')}</th>
                <th className="py-2 pe-4 font-normal">{t('userRole')}</th>
                <th className="py-2 pe-4 font-normal">{ta('colStatus')}</th>
                <th className="py-2 font-normal">{ta('colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((u) => {
                const isSelf = u._id === me._id;
                const name = u.email ?? u.name ?? u._id;
                return (
                  <tr key={u._id} className="border-b border-line">
                    <td className="sticky start-0 z-[1] max-w-[14rem] wrap-anywhere bg-paper py-3 pe-4 font-mono text-[13px]">
                      {u.email}
                    </td>
                    <td className="py-3 pe-4">{u.name ?? '—'}</td>
                    <td className="py-3 pe-4">
                      <RoleSelector
                        name={name}
                        role={u.role}
                        locked={isSelf}
                        lockedReason={isSelf ? t('selfRoleLocked') : undefined}
                        onApply={(next) => changeRole(u._id, name, next)}
                        onConfirmation={signalerConfirmation}
                      />
                    </td>
                    {/* Lifecycle (accounts workstream): state, then actions. */}
                    <td className="max-w-[14rem] py-3 pe-4 align-top">
                      <span className="flex flex-wrap gap-1">
                        <span
                          className={`rounded-pill border px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.06em] ${
                            u.suspended || u.deleting
                              ? 'border-bar-5 text-bar-5'
                              : 'border-line text-ink-soft'
                          }`}
                        >
                          {u.deleting
                            ? ta('statusDeleting')
                            : u.suspended
                              ? ta('statusSuspended')
                              : ta('statusActive')}
                        </span>
                        {u.twoFactor ? (
                          <span className="rounded-pill border border-accent-edge px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.06em] text-accent-text">
                            {ta('badge2fa')}
                          </span>
                        ) : null}
                      </span>
                      {u.suspensionReason ? (
                        <span className="mt-1 block wrap-anywhere text-xs text-ink-soft">
                          {ta('suspensionReasonLabel', {
                            reason: u.suspensionReason,
                          })}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3 align-top">
                      <AccountActions
                        row={u}
                        self={isSelf}
                        onConfirmation={signalerConfirmation}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollableRegion>
      )}

      <LoadMore status={status} loadMore={loadMore} pageSize={PAGE_SIZE} />
    </div>
  );
}

export default function AdminUsers() {
  const t = useTranslations('admin');
  // Same reason as above, and what is at stake here is the ENTIRE subtree:
  // without this, a flicker unmounts the invitation form and the
  // table at once, including input in progress.
  const me = useConnu(useQuery(api.users.current));

  if (me === undefined) {
    return <p className="mt-6 text-ink-soft">{t('loading')}</p>;
  }
  if (!isAdmin(me?.role)) {
    return <p className="mt-6 text-ink-soft">{t('usersOnlyAdmin')}</p>;
  }

  return (
    <div>
      <h1 className="font-display text-3xl">{t('users')}</h1>
      <TwoFactorPolicyPanel />
      <CreateAccountForm />
      <UsersTable />
    </div>
  );
}
