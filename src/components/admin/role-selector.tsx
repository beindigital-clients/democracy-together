'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ROLE_ORDER, type NetworkRole } from '@/lib/roles';
import { vocabulary } from '@/i18n/vocabulary';

// TWO-STEP role change (issue #38).
//
// The native `<select>`'s `onChange` triggered the mutation. On a laptop,
// scrolling the page with the cursor over a dropdown changed its value: a
// mouse-wheel movement thus demoted a moderator, with no confirmation or
// undo. The anti-lockout guard only protects the LAST administrator;
// everything else went through. (The shadcn select that replaced it ignores
// the wheel; the two steps stay, for the deliberate but mistaken choice.)
//
// Choosing a value now only PREPARES the change: nothing is sent until
// "Appliquer" has been clicked, then confirmed in a dialog that names the
// targeted account. Accidental triggering disappears at the root (the button
// does not exist while the draft equals the actual role), and the second
// safeguard covers the deliberate but mistaken click.
export function RoleSelector({
  name,
  role,
  locked = false,
  lockedReason,
  onApply,
  onConfirmation,
}: {
  // What NAMES the account in the label and in the confirmation
  // (the e-mail: it is this screen's identity column).
  name: string;
  role: NetworkRole;
  locked?: boolean;
  lockedReason?: string;
  // Returns `true` if the server accepted. A refusal (last admin, insufficient
  // rights) brings the selector back to the actual value.
  onApply: (role: NetworkRole) => Promise<boolean>;
  // Signals the opening and closing of the confirmation. The screen that renders
  // the LIST needs it: this dialog lives in a row, and a row that
  // disappears takes it along (see `utilisateurs/page.tsx`). Optional —
  // a caller that renders no list has no use for it.
  onConfirmation?: (ouverte: boolean) => void;
}) {
  const t = useTranslations('admin');
  const [draft, setDraft] = useState<NetworkRole | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  const value = draft ?? role;
  const changed = draft !== null && draft !== role;
  // The lock (one's own account) was only explained in `title`, hence on
  // hover: invisible to a finger, not announced (27/09 campaign, C-4). The
  // reason is visible text, linked to the selector via `aria-describedby`.
  const lockedId = useId();

  // A single place changes `confirming`, so that the signal cannot fall
  // out of sync with the state.
  function confirmer(ouverte: boolean) {
    setConfirming(ouverte);
    onConfirmation?.(ouverte);
  }

  async function apply() {
    if (draft === null) return;
    setPending(true);
    try {
      const ok = await onApply(draft);
      // On success the draft is KEPT: the Convex query returns the new value
      // right after, and resetting it would make the old role flicker in the
      // meantime.
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
        onValueChange={(v) => setDraft(v as NetworkRole)}
      >
        <SelectTrigger
          size="sm"
          aria-label={`${t('userRole')} ${name}`}
          aria-describedby={locked && lockedReason ? lockedId : undefined}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {ROLE_ORDER.map((r) => (
              <SelectItem key={r} value={r}>
                {vocabulary(t, 'role_', r)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {locked && lockedReason ? (
        <p id={lockedId} className="basis-full text-xs text-muted">
          {lockedReason}
        </p>
      ) : null}

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
