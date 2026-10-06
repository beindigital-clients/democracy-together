'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { KOHOP_DECLARED_RELATIONSHIPS } from '@convex/lib/kohopLinks';
import { Button } from '@/components/ui/button';
import { FormError, TextField, TextareaField } from '@/components/ui/field';
import { SelectField } from '@/components/ui/choice-fields';
import { vocabulary } from '@/i18n/vocabulary';
import { useKohopError } from './use-kohop';

// PROPOSING SOMEONE OUTSIDE THE NETWORK (second recourse). Nothing is sent from
// here: the review chief approves first, and the invitation then carries a
// personal one-time link. The server applies the same link rules as for a
// member; a refusal says only that the person cannot be retained.
export function ExternalReviewerForm({
  contributionId,
  titularFull,
  substituteFull,
}: {
  contributionId: Id<'kohopContributions'>;
  titularFull: boolean;
  substituteFull: boolean;
}) {
  const t = useTranslations('kohop');
  const errorMessage = useKohopError();
  const propose = useMutation(api.kohopExternal.proposeExternalReviewer);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [affiliation, setAffiliation] = useState('');
  const [publicUrl, setPublicUrl] = useState('');
  const [rationale, setRationale] = useState('');
  const [relationship, setRelationship] = useState('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function send(slot: 'titular' | 'substitute') {
    setBusy(true);
    setError('');
    setDone(false);
    try {
      await propose({
        contributionId,
        slot,
        name,
        email,
        affiliation,
        publicUrl,
        rationale,
        declaredRelationship: relationship,
      });
      setName('');
      setEmail('');
      setAffiliation('');
      setPublicUrl('');
      setRationale('');
      setRelationship('none');
      setDone(true);
      setOpen(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 border-t border-line pt-5">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {t('externalToggle')}
      </Button>
      {done ? (
        <p role="status" className="mt-2 text-sm text-bar-1">
          {t('externalProposed')}
        </p>
      ) : null}
      {open ? (
        <div className="mt-3 space-y-4 rounded-md bg-surface-2 p-4">
          <p className="max-w-[62ch] text-sm text-ink-soft">
            {t('externalLead')}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={t('externalName')}
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <TextField
              label={t('externalEmail')}
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <TextField
            label={t('externalAffiliation')}
            maxLength={200}
            value={affiliation}
            onChange={(e) => setAffiliation(e.target.value)}
          />
          <TextField
            label={t('externalUrl')}
            hint={t('externalUrlHint')}
            type="url"
            value={publicUrl}
            onChange={(e) => setPublicUrl(e.target.value)}
          />
          <TextareaField
            label={t('externalRationale')}
            hint={t('externalRationaleHint')}
            rows={3}
            maxLength={1000}
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
          />
          <SelectField
            label={t('relationshipLabel')}
            hint={t('relationshipHint')}
            value={relationship}
            onValueChange={setRelationship}
            options={KOHOP_DECLARED_RELATIONSHIPS.map((r) => ({
              value: r,
              label: vocabulary(t, 'relationship_', r),
            }))}
          />
          <FormError>{error}</FormError>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy || titularFull}
              onClick={() => send('titular')}
            >
              {t('asTitular')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || substituteFull}
              onClick={() => send('substitute')}
            >
              {t('asSubstitute')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
