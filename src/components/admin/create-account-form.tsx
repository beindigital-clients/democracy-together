'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { SITE_LOCALES, type SiteLocale } from '@convex/lib/locales';
import { Button } from '@/components/ui/button';
import { FormError, SelectField, TextField } from '@/components/ui/field';
import { ROLE_ORDER, type NetworkRole } from '@/lib/roles';
import { isEmail } from '@/lib/validation';
import { vocabulary } from '@/i18n/vocabulary';
import { useServerErrorMessage } from '@/components/admin/server-error';

// DIRECT ACCOUNT CREATION (F-63, accounts workstream).
//
// Replaces the old invitation form: the account is opened IMMEDIATELY,
// linked if needed to an organization (with its role in it), and a
// welcome e-mail is sent in the chosen language. An already-known address is
// never modified — neither role nor language: the welcome is resent and the
// affiliation added. The screen says when no e-mail provider is
// configured, rather than announcing a send that will not happen.
type Status = 'idle' | 'pending' | 'created' | 'existing' | 'error';

export function CreateAccountForm() {
  const t = useTranslations('accounts');
  const tAdmin = useTranslations('admin');
  const serverMessage = useServerErrorMessage();
  const create = useMutation(api.accounts.createAccount);
  const orgs = useQuery(api.orgAdmin.listForAdmin);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<NetworkRole>('membre');
  const [orgId, setOrgId] = useState<Id<'organizations'> | ''>('');
  const [orgRole, setOrgRole] = useState<'owner' | 'member'>('member');
  const [locale, setLocale] = useState<SiteLocale>('fr');
  const [status, setStatus] = useState<Status>('idle');
  const [noEmail, setNoEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isEmail(email.trim())) {
      setStatus('error');
      setError(t('createError'));
      return;
    }
    setStatus('pending');
    try {
      const res = await create({
        email: email.trim(),
        role,
        locale,
        ...(orgId ? { organizationId: orgId, orgRole } : {}),
      });
      setNoEmail(res.emailMode === 'none');
      setStatus(res.created ? 'created' : 'existing');
      if (res.created) setEmail('');
    } catch (err) {
      setStatus('error');
      setError(serverMessage(err));
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="mt-6 rounded-md border border-line bg-surface p-5"
    >
      <h2 className="font-display text-lg">{t('createTitle')}</h2>
      <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-ink-soft">
        {t('createHint')}
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <TextField
          label={t('createEmail')}
          type="email"
          dir="ltr"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status !== 'idle') setStatus('idle');
          }}
          aria-invalid={status === 'error' || undefined}
          controlClassName="min-w-[16rem]"
          required
        />
        <SelectField
          label={t('createRole')}
          value={role}
          onChange={(e) => setRole(e.target.value as NetworkRole)}
          controlClassName="w-auto"
        >
          {ROLE_ORDER.map((r) => (
            <option key={r} value={r}>
              {vocabulary(tAdmin, 'role_', r)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('createLocale')}
          value={locale}
          onChange={(e) => setLocale(e.target.value as SiteLocale)}
          controlClassName="w-auto"
        >
          {SITE_LOCALES.map((l) => (
            <option key={l} value={l}>
              {l.toUpperCase()}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <SelectField
          label={t('createOrg')}
          value={orgId}
          onChange={(e) => setOrgId(e.target.value as Id<'organizations'> | '')}
          controlClassName="max-w-[20rem]"
        >
          <option value="">{t('createOrgNone')}</option>
          {(orgs ?? []).map((o) => (
            <option key={o._id} value={o._id}>
              {o.name}
            </option>
          ))}
        </SelectField>
        {orgId ? (
          <SelectField
            label={t('createOrgRole')}
            value={orgRole}
            onChange={(e) => setOrgRole(e.target.value as 'owner' | 'member')}
            controlClassName="w-auto"
          >
            <option value="member">{t('orgRole_member')}</option>
            <option value="owner">{t('orgRole_owner')}</option>
          </SelectField>
        ) : null}
        <Button type="submit" disabled={status === 'pending'}>
          {t('createSubmit')}
        </Button>
      </div>

      {status === 'created' || status === 'existing' ? (
        <p role="status" className="mt-3 text-[13px] text-ink-soft">
          {status === 'created' ? t('createDone') : t('createExisting')}
          {noEmail ? ` ${t('createNoEmail')}` : null}
        </p>
      ) : null}
      <FormError className="mt-3 text-[13px]">
        {status === 'error' ? error : null}
      </FormError>
    </form>
  );
}
