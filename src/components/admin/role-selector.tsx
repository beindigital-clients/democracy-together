'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ROLE_ORDER, type NetworkRole } from '@/lib/roles';
import { vocabulary } from '@/i18n/vocabulary';

// Changement de rôle en DEUX TEMPS (issue #38).
//
// Le `onChange` du `<Select>` déclenchait la mutation. Sur un portable, faire
// défiler la page avec le curseur au-dessus d'une liste déroulante en change la
// valeur : un mouvement de molette rétrogradait donc un modérateur, sans
// confirmation ni annulation. La garde anti-lockout ne protège que le DERNIER
// administrateur ; tout le reste passait.
//
// Choisir une valeur ne fait désormais que PRÉPARER le changement : rien ne
// part tant que « Appliquer » n'a pas été cliqué, puis confirmé dans une boîte
// qui nomme le compte visé. Le déclenchement accidentel disparaît à la racine
// (le bouton n'existe pas tant que le brouillon égale le rôle réel), et le
// second garde-fou couvre le clic volontaire mais erroné.
export function RoleSelector({
  name,
  role,
  locked = false,
  lockedReason,
  onApply,
  onConfirmation,
}: {
  // Ce qui NOMME le compte dans l'étiquette et dans la confirmation
  // (l'e-mail : c'est la colonne d'identité de cet écran).
  name: string;
  role: NetworkRole;
  locked?: boolean;
  lockedReason?: string;
  // Rend `true` si le serveur a accepté. Un refus (dernier admin, droits
  // insuffisants) ramène le sélecteur à la valeur réelle.
  onApply: (role: NetworkRole) => Promise<boolean>;
  // Signale l'ouverture et la fermeture de la confirmation. L'écran qui rend
  // la LISTE en a besoin : cette boîte vit dans une ligne, et une ligne qui
  // disparaît l'emporte avec elle (cf. `utilisateurs/page.tsx`). Facultatif —
  // un appelant qui ne rend pas de liste n'a rien à en faire.
  onConfirmation?: (ouverte: boolean) => void;
}) {
  const t = useTranslations('admin');
  const [draft, setDraft] = useState<NetworkRole | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  const value = draft ?? role;
  const changed = draft !== null && draft !== role;

  // Un seul endroit change `confirming`, pour que le signal ne puisse pas se
  // désynchroniser de l'état.
  function confirmer(ouverte: boolean) {
    setConfirming(ouverte);
    onConfirmation?.(ouverte);
  }

  async function apply() {
    if (draft === null) return;
    setPending(true);
    try {
      const ok = await onApply(draft);
      // En cas de succès le brouillon est CONSERVÉ : la requête Convex rend la
      // nouvelle valeur dans la foulée, et le remettre à zéro ferait clignoter
      // l'ancien rôle entre-temps.
      if (!ok) setDraft(null);
    } finally {
      setPending(false);
      confirmer(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={value}
        disabled={locked || pending}
        aria-label={`${t('userRole')} ${name}`}
        title={lockedReason}
        onChange={(e) => setDraft(e.target.value as NetworkRole)}
      >
        {ROLE_ORDER.map((r) => (
          <option key={r} value={r}>
            {vocabulary(t, 'role_', r)}
          </option>
        ))}
      </Select>

      {changed ? (
        <Button
          size="sm"
          disabled={pending}
          aria-label={t('roleApplyFor', { name })}
          onClick={() => confirmer(true)}
        >
          {t('roleApply')}
        </Button>
      ) : null}

      <ConfirmDialog
        open={changed && confirming}
        title={t('confirmRoleTitle', { name })}
        description={t('confirmRoleBody', {
          from: vocabulary(t, 'role_', role),
          to: vocabulary(t, 'role_', value),
        })}
        confirmLabel={t('confirmRoleConfirm')}
        cancelLabel={t('confirmCancel')}
        pending={pending}
        onConfirm={apply}
        onCancel={() => confirmer(false)}
      />
    </div>
  );
}
