'use client';

import { useQuery, useMutation, usePaginatedQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { isAdmin, type NetworkRole } from '@/lib/roles';
import { InviteUserForm } from '@/components/admin/invite-user-form';
import { LoadMore } from '@/components/admin/load-more';
import { RoleSelector } from '@/components/admin/role-selector';
import { useActionFeedback } from '@/components/admin/action-feedback';

// Taille de page. Le serveur la replafonne : elle est indicative.
const PAGE_SIZE = 50;

function UsersTable() {
  const t = useTranslations('admin');
  // PAGINÉ (issue #8) : la liste chargeait la table `users` en entier. L'ordre
  // (par e-mail) vient désormais de l'index côté serveur, pas d'un tri client.
  const {
    results: users,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.admin.listUsers,
    {},
    { initialNumItems: PAGE_SIZE },
  );
  const me = useQuery(api.users.current);
  const setRole = useMutation(api.users.setRole);
  const notify = useActionFeedback();

  if (status === 'LoadingFirstPage' || !me) {
    return <p className="mt-6 text-ink-soft">{t('loading')}</p>;
  }

  // Appelée depuis `RoleSelector`, donc APRÈS « Appliquer » puis confirmation
  // (issue #38) : la molette au-dessus de la liste déroulante n'arrive plus
  // jusqu'ici. Rend `true` si le serveur a accepté.
  async function changeRole(
    userId: string,
    name: string,
    role: NetworkRole,
  ): Promise<boolean> {
    try {
      // userId est un Id<'users'> côté API ; le cast reste sûr (source = listUsers).
      await setRole({ userId: userId as never, role });
      notify(t('feedbackRoleChanged', { name, role: t(`role_${role}`) }));
      return true;
    } catch {
      // Rejet serveur (ex. dernier admin / rôle insuffisant) : l'écran le DIT,
      // là où il restait muet, et le sélecteur revient à la valeur réelle.
      notify(t('feedbackError'), 'error');
      return false;
    }
  }

  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
            <th className="py-2 pr-4 font-normal">{t('userEmail')}</th>
            <th className="py-2 pr-4 font-normal">{t('userName')}</th>
            <th className="py-2 font-normal">{t('userRole')}</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const isSelf = u._id === me._id;
            const name = u.email ?? u.name ?? u._id;
            return (
              <tr key={u._id} className="border-b border-line">
                <td className="py-3 pr-4 font-mono text-[13px]">{u.email}</td>
                <td className="py-3 pr-4">{u.name ?? '—'}</td>
                <td className="py-3">
                  <RoleSelector
                    name={name}
                    role={u.role}
                    locked={isSelf}
                    lockedReason={isSelf ? t('selfRoleLocked') : undefined}
                    onApply={(role) => changeRole(u._id, name, role)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <LoadMore status={status} loadMore={loadMore} pageSize={PAGE_SIZE} />
    </div>
  );
}

export default function AdminUsers() {
  const t = useTranslations('admin');
  const me = useQuery(api.users.current);

  if (me === undefined) {
    return <p className="mt-6 text-ink-soft">{t('loading')}</p>;
  }
  if (!isAdmin(me?.role)) {
    return <p className="mt-6 text-ink-soft">{t('usersOnlyAdmin')}</p>;
  }

  return (
    <div>
      <h1 className="font-display text-3xl">{t('users')}</h1>
      <InviteUserForm />
      <UsersTable />
    </div>
  );
}
