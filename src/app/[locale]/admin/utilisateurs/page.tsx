'use client';

import { useQuery, useMutation } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Select } from '@/components/ui/select';
import { ROLE_ORDER, isAdmin, type NetworkRole } from '@/lib/roles';
import { InviteUserForm } from '@/components/admin/invite-user-form';

function UsersTable() {
  const t = useTranslations('admin');
  const users = useQuery(api.admin.listUsers);
  const me = useQuery(api.users.current);
  const setRole = useMutation(api.users.setRole);

  if (users === undefined || !me) {
    return <p className="mt-6 text-ink-soft">{t('loading')}</p>;
  }

  async function changeRole(userId: string, role: NetworkRole) {
    try {
      // userId est un Id<'users'> côté API ; le cast reste sûr (source = listUsers).
      await setRole({ userId: userId as never, role });
    } catch {
      // rejet serveur (ex. dernier admin / rôle insuffisant) : le <Select>
      // contrôlé revient automatiquement à la valeur réelle.
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
            return (
              <tr key={u._id} className="border-b border-line">
                <td className="py-3 pr-4 font-mono text-[13px]">{u.email}</td>
                <td className="py-3 pr-4">{u.name ?? '—'}</td>
                <td className="py-3">
                  <Select
                    value={u.role}
                    disabled={isSelf}
                    aria-label={`${t('userRole')} ${u.email}`}
                    title={isSelf ? t('selfRoleLocked') : undefined}
                    onChange={(e) =>
                      changeRole(u._id, e.target.value as NetworkRole)
                    }
                  >
                    {ROLE_ORDER.map((r) => (
                      <option key={r} value={r}>
                        {t(`role_${r}`)}
                      </option>
                    ))}
                  </Select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
