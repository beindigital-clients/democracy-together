'use client';

import { useState } from 'react';
import { useQuery, useMutation, usePaginatedQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { ROLE_ORDER, isAdmin, type NetworkRole } from '@/lib/roles';
import { SelectField } from '@/components/ui/field';
import { InviteUserForm } from '@/components/admin/invite-user-form';
import { AdminSearch } from '@/components/admin/admin-search';
import { LoadMore } from '@/components/admin/load-more';
import { RoleSelector } from '@/components/admin/role-selector';
import { useActionFeedback } from '@/components/admin/action-feedback';
import { vocabulary } from '@/i18n/vocabulary';
import { ScrollableRegion } from '@/components/ui/scrollable-region';
import { useConnu } from '@/hooks/use-connu';

// Taille de page. Le serveur la replafonne : elle est indicative.
const PAGE_SIZE = 50;

function UsersTable() {
  const t = useTranslations('admin');
  // PAGINÉ (issue #8) : la liste chargeait la table `users` en entier. L'ordre
  // (par e-mail) vient désormais de l'index côté serveur, pas d'un tri client.
  //
  // RECHERCHE ET FILTRE SERVEUR (issue #49) : les deux sont des ARGUMENTS de la
  // query paginée, pas un filtrage du tableau rendu. Les changer repart d'une
  // première page — c'est le comportement voulu, et c'est aussi la raison pour
  // laquelle chercher fonctionne : la ligne cherchée n'est en général pas dans
  // la page déjà chargée.
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
  // `useConnu` : un clignotement de cette query ne doit pas DÉMONTER le
  // tableau. Il emporterait avec lui la boîte de dialogue de confirmation
  // ouverte dans une ligne — constaté en CI, le bouton « Changer le rôle »
  // détaché du DOM pendant qu'on le cliquait.
  const me = useConnu(useQuery(api.users.current));
  const setRole_ = useMutation(api.users.setRole);
  const notify = useActionFeedback();

  // GELER LA LISTE PENDANT QU'UNE CONFIRMATION EST OUVERTE.
  //
  // La boîte de confirmation vit DANS une ligne : si la ligne disparaît, la
  // boîte part avec, au milieu du geste. `useConnu` a fermé le premier chemin
  // — le clignotement de `users.current`. Il en restait un second, et la CI
  // l'a montré : la recherche est TEMPORISÉE, donc frapper puis cliquer
  // « Appliquer » dans la foulée laisse partir la requête pendant que la boîte
  // est ouverte. Les arguments de la query changent, `status` repasse à
  // `LoadingFirstPage`, la liste se vide, la confirmation s'évanouit.
  //
  // On fige donc les lignes AFFICHÉES le temps de la confirmation. La fenêtre
  // est courte et bornée par un geste de l'utilisateur : rien ne peut y
  // vieillir longtemps, et la liste repart fraîche dès la fermeture — y
  // compris après un changement accepté, dont la valeur arrive alors.
  //
  // Une seule boîte à la fois : le voile couvre l'écran et intercepte les
  // clics, donc un booléen suffit là où un compteur ne servirait qu'à
  // décrire une situation impossible.
  const [gel, setGel] = useState<typeof users | null>(null);
  const lignes = gel ?? users;
  function signalerConfirmation(ouverte: boolean) {
    setGel(ouverte ? users : null);
  }

  // Appelée depuis `RoleSelector`, donc APRÈS « Appliquer » puis confirmation
  // (issue #38) : la molette au-dessus de la liste déroulante n'arrive plus
  // jusqu'ici. Rend `true` si le serveur a accepté.
  async function changeRole(
    userId: string,
    name: string,
    next: NetworkRole,
  ): Promise<boolean> {
    try {
      // userId est un Id<'users'> côté API ; le cast reste sûr (source = listUsers).
      await setRole_({ userId: userId as never, role: next });
      notify(
        t('feedbackRoleChanged', { name, role: vocabulary(t, 'role_', next) }),
      );
      return true;
    } catch {
      // Rejet serveur (ex. dernier admin / rôle insuffisant) : l'écran le DIT,
      // là où il restait muet, et le sélecteur revient à la valeur réelle.
      notify(t('feedbackError'), 'error');
      return false;
    }
  }

  const filtering = search !== '' || role !== '';

  return (
    <div className="mt-6">
      {/* Les commandes restent montées pendant le chargement : sinon le champ
          se démonterait sous les doigts à chaque nouvelle recherche. */}
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
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                <th className="py-2 pr-4 font-normal">{t('userEmail')}</th>
                <th className="py-2 pr-4 font-normal">{t('userName')}</th>
                <th className="py-2 font-normal">{t('userRole')}</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((u) => {
                const isSelf = u._id === me._id;
                const name = u.email ?? u.name ?? u._id;
                return (
                  <tr key={u._id} className="border-b border-line">
                    <td className="py-3 pr-4 font-mono text-[13px]">
                      {u.email}
                    </td>
                    <td className="py-3 pr-4">{u.name ?? '—'}</td>
                    <td className="py-3">
                      <RoleSelector
                        name={name}
                        role={u.role}
                        locked={isSelf}
                        lockedReason={isSelf ? t('selfRoleLocked') : undefined}
                        onApply={(next) => changeRole(u._id, name, next)}
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
  // Même raison qu'au-dessus, et l'enjeu est ici le sous-arbre ENTIER :
  // sans cela, un clignotement démonte le formulaire d'invitation et le
  // tableau d'un coup, saisie en cours comprise.
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
      <InviteUserForm />
      <UsersTable />
    </div>
  );
}
