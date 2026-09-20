'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Button } from '@/components/ui/button';
import { FormError, SelectField, TextField } from '@/components/ui/field';
import { ROLE_ORDER, type NetworkRole } from '@/lib/roles';
import { isEmail } from '@/lib/validation';
import { vocabulary } from '@/i18n/vocabulary';

// Invitation manuelle (F-63). Sans elle, et depuis la suppression de
// l'auto-inscription, le seul moyen d'ouvrir un compte était d'approuver une
// candidature d'adhésion : impossible d'amorcer le secrétariat, un modérateur
// ou un éditeur. Créer la ligne `users` suffit à rendre le compte connectable
// par code à usage unique.
type Status = 'idle' | 'pending' | 'created' | 'existing' | 'error';

export function InviteUserForm() {
  const t = useTranslations('admin');
  const invite = useMutation(api.users.inviteUser);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<NetworkRole>('membre');
  const [status, setStatus] = useState<Status>('idle');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isEmail(email.trim())) {
      setStatus('error');
      return;
    }
    setStatus('pending');
    try {
      const res = await invite({ email: email.trim(), role });
      setStatus(res.created ? 'created' : 'existing');
      if (res.created) setEmail('');
    } catch {
      setStatus('error');
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mt-6 rounded-md border border-line bg-surface p-5"
    >
      <h2 className="font-display text-lg">{t('inviteTitle')}</h2>
      <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-ink-soft">
        {t('inviteHint')}
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <TextField
          label={t('inviteEmail')}
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status !== 'idle') setStatus('idle');
          }}
          // L'erreur d'adresse s'affiche sous le formulaire (elle vaut aussi
          // pour l'envoi) ; le champ, lui, est marqué invalide ici.
          aria-invalid={status === 'error' || undefined}
          controlClassName="min-w-[16rem]"
          required
        />
        <SelectField
          label={t('inviteRole')}
          value={role}
          onChange={(e) => setRole(e.target.value as NetworkRole)}
          controlClassName="w-auto"
        >
          {ROLE_ORDER.map((r) => (
            <option key={r} value={r}>
              {vocabulary(t, 'role_', r)}
            </option>
          ))}
        </SelectField>
        <Button type="submit" disabled={status === 'pending'}>
          {t('inviteSubmit')}
        </Button>
      </div>

      {status === 'created' ? (
        <p role="status" className="mt-3 text-[13px] text-ink-soft">
          {t('inviteCreated')}
        </p>
      ) : status === 'existing' ? (
        <p role="status" className="mt-3 text-[13px] text-ink-soft">
          {t('inviteExisting')}
        </p>
      ) : status === 'error' ? (
        <FormError className="mt-3 text-[13px]">{t('inviteError')}</FormError>
      ) : null}
    </form>
  );
}
