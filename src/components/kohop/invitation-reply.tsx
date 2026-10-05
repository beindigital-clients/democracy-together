'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { FormError, TextField, TextareaField } from '@/components/ui/field';
import { useKohopError } from './use-kohop';

// THE ANSWER TO AN INVITATION (K-13). Accepting is conditioned on two
// declarations — no conflict of interest, and consent to the publication of
// the analysis under the reviewer's name. Declining asks for nothing, and
// offers to suggest someone else. The full text only opens once accepted.

type Choice = 'accept' | 'decline' | '';

export function InvitationReply({
  reviewerId,
}: {
  reviewerId: Id<'kohopReviewers'>;
}) {
  const t = useTranslations('kohop');
  const errorMessage = useKohopError();
  const respond = useMutation(api.kohopReviews.respond);
  const [choice, setChoice] = useState<Choice>('');
  const [noConflict, setNoConflict] = useState(false);
  const [consent, setConsent] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [note, setNote] = useState('');
  const [suggestName, setSuggestName] = useState('');
  const [suggestEmail, setSuggestEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send(accept: boolean) {
    setBusy(true);
    setError('');
    try {
      await respond({
        reviewerId,
        accept,
        hasConflict: accept ? false : conflict,
        consent: accept ? consent : undefined,
        note: accept ? undefined : note.trim() || undefined,
        suggestedName: accept ? undefined : suggestName.trim() || undefined,
        suggestedEmail: accept ? undefined : suggestEmail.trim() || undefined,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="kohop-invite"
      className="rounded-md border border-accent-edge bg-accent-tint p-5 sm:p-6"
    >
      <h2 id="kohop-invite" className="font-display text-xl text-ink">
        {t('inviteTitle')}
      </h2>
      <p className="mt-1 max-w-[62ch] text-sm text-ink-soft">
        {t('inviteBody')}
      </p>

      <p className="mt-2 text-sm">
        <Link
          href="/kohop/guide-relecteur"
          target="_blank"
          rel="noopener"
          className="font-medium text-accent-text hover:underline"
        >
          {t('readReviewerGuide')}{' '}
          <span className="sr-only">{t('inNewTab')}</span>
        </Link>
      </p>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-ink">
          {t('answerLegend')}
        </legend>
        <RadioGroup
          name="kohop-answer"
          value={choice}
          onValueChange={(v) =>
            setChoice(
              v === 'accept' ? 'accept' : v === 'decline' ? 'decline' : '',
            )
          }
          className="mt-2 gap-1"
        >
          {(['accept', 'decline'] as const).map((c) => (
            <label
              key={c}
              className="flex min-h-11 items-center gap-3 text-sm text-ink"
            >
              <RadioGroupItem value={c} />
              {c === 'accept' ? t('answerAccept') : t('answerDecline')}
            </label>
          ))}
        </RadioGroup>
      </fieldset>

      {choice === 'accept' ? (
        <div className="mt-4 space-y-3">
          <label className="flex items-start gap-3 text-sm text-ink">
            <Checkbox
              className="mt-0.5"
              checked={noConflict}
              onCheckedChange={(c) => setNoConflict(c === true)}
            />
            <span>{t('noConflict')}</span>
          </label>
          <label className="flex items-start gap-3 text-sm text-ink">
            <Checkbox
              className="mt-0.5"
              checked={consent}
              onCheckedChange={(c) => setConsent(c === true)}
            />
            <span>{t('consentPublish')}</span>
          </label>
          <FormError>{error}</FormError>
          <Button
            type="button"
            disabled={busy || !noConflict || !consent}
            onClick={() => send(true)}
          >
            {t('acceptSubmit')}
          </Button>
        </div>
      ) : null}

      {choice === 'decline' ? (
        <div className="mt-4 space-y-3">
          <label className="flex items-start gap-3 text-sm text-ink">
            <Checkbox
              className="mt-0.5"
              checked={conflict}
              onCheckedChange={(c) => setConflict(c === true)}
            />
            <span>{t('declineConflict')}</span>
          </label>
          <TextareaField
            label={t('declineNote')}
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label={t('suggestName')}
              maxLength={120}
              value={suggestName}
              onChange={(e) => setSuggestName(e.target.value)}
            />
            <TextField
              label={t('suggestEmail')}
              type="email"
              value={suggestEmail}
              onChange={(e) => setSuggestEmail(e.target.value)}
            />
          </div>
          <FormError>{error}</FormError>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => send(false)}
          >
            {t('declineSubmit')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
