'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { FormError, TextField, TextareaField } from '@/components/ui/field';
import { Link } from '@/i18n/navigation';
import { useKohopDates, useKohopError } from '@/components/kohop/use-kohop';

const WRAP = 'mx-auto w-full max-w-[720px] px-4 py-12 sm:px-6';

// ANSWERING A REVIEW INVITATION WITHOUT AN ACCOUNT. The token in the address is
// the only credential; the page asks for the invited address as a second factor
// and says the SAME thing whatever is wrong with the link.
export default function KohopInvitationPage() {
  const t = useTranslations('kohop');
  const dates = useKohopDates();
  const errorMessage = useKohopError();
  const params = useParams<{ token: string }>();
  const token = params.token;
  const invitation = useQuery(api.kohopExternal.getInvitation, { token });
  const respond = useMutation(api.kohopExternal.respondExternal);

  const [email, setEmail] = useState('');
  const [choice, setChoice] = useState<'accept' | 'decline' | ''>('');
  const [noConflict, setNoConflict] = useState(false);
  const [consent, setConsent] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [outcome, setOutcome] = useState<
    'accepted' | 'declined' | 'invalid' | null
  >(null);

  if (invitation === undefined) {
    return (
      <div className={WRAP}>
        <p className="text-ink-soft" role="status">
          {t('loading')}
        </p>
      </div>
    );
  }

  if (outcome === 'accepted') {
    return (
      <div className={WRAP}>
        <h1 className="font-display text-3xl">{t('invAcceptedTitle')}</h1>
        <p className="mt-3 max-w-[62ch] text-ink-soft">
          {t('invAcceptedBody')}
        </p>
        <p className="mt-6">
          <Link
            href="/connexion-otp"
            className="inline-flex min-h-11 items-center rounded-md bg-accent px-5 font-medium text-white hover:opacity-90"
          >
            {t('invSignIn')}
          </Link>
        </p>
      </div>
    );
  }
  if (outcome === 'declined') {
    return (
      <div className={WRAP}>
        <h1 className="font-display text-3xl">{t('invDeclinedTitle')}</h1>
        <p className="mt-3 max-w-[62ch] text-ink-soft">
          {t('invDeclinedBody')}
        </p>
      </div>
    );
  }

  if (!invitation.valid || outcome === 'invalid') {
    return (
      <div className={WRAP}>
        <h1 className="font-display text-3xl">{t('invInvalidTitle')}</h1>
        <p className="mt-3 max-w-[62ch] text-ink-soft">{t('invInvalidBody')}</p>
      </div>
    );
  }

  async function send() {
    if (choice === '') return;
    setBusy(true);
    setError('');
    try {
      const res = await respond({
        token,
        email,
        accept: choice === 'accept',
        hasConflict: false,
        consent: choice === 'accept' ? consent : undefined,
        note: choice === 'decline' ? note.trim() || undefined : undefined,
      });
      setOutcome(!res.ok ? 'invalid' : res.accepted ? 'accepted' : 'declined');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={WRAP}>
      <h1 className="font-display text-3xl">{t('invTitle')}</h1>
      <p className="mt-3 max-w-[62ch] text-ink-soft">{t('invLead')}</p>

      <section
        aria-labelledby="inv-text"
        className="mt-8 rounded-md border border-line bg-surface p-5"
      >
        <h2
          id="inv-text"
          lang={invitation.lang}
          className="font-display text-2xl"
        >
          {invitation.title}
        </h2>
        <p lang={invitation.lang} className="mt-2 text-ink-soft">
          {invitation.standfirst}
        </p>
        <p className="mt-3 text-sm font-medium text-ink">
          {t('invDeadline', { date: dates.day(invitation.dueAt) })}
        </p>
      </section>

      <div className="mt-8 space-y-6">
        <TextField
          label={t('invEmailLabel')}
          hint={t('invEmailHint')}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <fieldset>
          <legend className="text-sm font-medium text-ink">
            {t('answerLegend')}
          </legend>
          <RadioGroup
            name="kohop-external-answer"
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
          <div className="space-y-3">
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
          </div>
        ) : null}
        {choice === 'decline' ? (
          <TextareaField
            label={t('declineNote')}
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        ) : null}

        <FormError>{error}</FormError>
        <Button
          type="button"
          disabled={
            busy ||
            !email.trim() ||
            choice === '' ||
            (choice === 'accept' && (!noConflict || !consent))
          }
          onClick={send}
        >
          {choice === 'decline' ? t('declineSubmit') : t('acceptSubmit')}
        </Button>
        <p className="text-xs text-muted">{t('invPrivacy')}</p>
      </div>
    </div>
  );
}
