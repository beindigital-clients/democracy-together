'use client';

import { useId, useState } from 'react';
import { useMutation } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ROLE_ORDER, type NetworkRole } from '@/lib/roles';
import { isEmail } from '@/lib/validation';

// Invitation manuelle (F-63). Sans elle, et depuis la suppression de
// l'auto-inscription, le seul moyen d'ouvrir un compte était d'approuver une
// candidature d'adhésion : impossible d'amorcer le secrétariat, un modérateur
// ou un éditeur. Créer la ligne `users` suffit à rendre le compte connectable
// par code à usage unique.
type Status = 'idle' | 'pending' | 'created' | 'existing' | 'error';

export function InviteUserForm() {
  const t = useTranslations('admin');
  const invite = useMutation(api.users.inviteUser);
  const ids = { email: useId(), role: useId() };
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
        <div>
          <label htmlFor={ids.email} className="block text-sm text-ink-soft">
            {t('inviteEmail')}
          </label>
          <Input
            id={ids.email}
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (status !== 'idle') setStatus('idle');
            }}
            aria-invalid={status === 'error' || undefined}
            className="mt-1 min-w-[16rem]"
            required
          />
        </div>
        <div>
          <label htmlFor={ids.role} className="block text-sm text-ink-soft">
            {t('inviteRole')}
          </label>
          <Select
            id={ids.role}
            value={role}
            onChange={(e) => setRole(e.target.value as NetworkRole)}
            className="mt-1"
          >
            {ROLE_ORDER.map((r) => (
              <option key={r} value={r}>
                {t(`role_${r}`)}
              </option>
            ))}
          </Select>
        </div>
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
        <p role="alert" className="mt-3 text-[13px] text-bar-1">
          {t('inviteError')}
        </p>
      ) : null}
    </form>
  );
}
