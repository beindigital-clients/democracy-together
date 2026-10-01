'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useAction, useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import {
  CURRENCY_EXPONENT,
  DONATION_BOUNDS,
  SUGGESTED_DONATIONS,
  type Currency,
} from '@convex/lib/payments/amounts';
import { Button } from '@/components/ui/button';
import {
  FormError,
  TextField,
  TextareaField,
  useFormFields,
} from '@/components/ui/field';
import { useRecaptcha } from '@/lib/recaptcha';
import { isEmail } from '@/lib/validation';
import { resolveLocale } from '@/i18n/locale';
import { vocabulary } from '@/i18n/vocabulary';
import { PaymentsUnavailable } from './payments-unavailable';
import { formatMajor, knownPaymentError } from './format';
import { Checkbox } from '@/components/ui/checkbox';

// DONATION FORM (F-28) — one-off or monthly, suggested or custom amount,
// in euros or US dollars depending on the configured providers.
//
// The bounds and suggested amounts are READ from the module shared with the
// server (`@convex/lib/payments/amounts`): the field rejects what the server
// would reject, before the redirect. The server re-checks everything.
//
// No provider: no form, but the alternative (bank transfer, contact).

const MESSAGE_MAX = 500;
const PILL =
  'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-pill border px-4 py-2 text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2';
const PILL_ON = 'border-accent-edge bg-accent-tint text-accent-text';
const PILL_OFF =
  'border-line bg-surface-2 text-ink-soft hover:border-line-strong hover:text-ink';

export function DonationForm() {
  const t = useTranslations('payments');
  const locale = useLocale();
  const options = useQuery(api.payments.checkout.paymentOptions, {});
  const me = useQuery(api.users.current);
  const start = useAction(api.payments.checkout.startDonation);
  const executeRecaptcha = useRecaptcha();

  const [chosenCurrency, setCurrency] = useState<Currency | null>(null);
  const [recurring, setRecurring] = useState(false);
  const [chosenPreset, setPreset] = useState<number | 'other' | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { values, field, validate, setValue } = useFormFields({
    other: '',
    email: '',
    name: '',
    message: '',
  });

  // Signed in: the account's address pre-fills the field (once, without
  // overwriting user input). The donation is then linked to the account — receipt in
  // the member area.
  const accountEmail = me?.email;
  const typedEmail = values.email;
  useEffect(() => {
    if (accountEmail && !typedEmail) setValue('email', accountEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pre-fill only when the account loads
  }, [accountEmail, setValue]);

  if (options === undefined) {
    return <p className="text-ink-soft">{t('loading')}</p>;
  }
  if (options.currencies.length === 0) {
    return (
      <PaymentsUnavailable
        bankTransfer={options.bankTransfer}
        purpose="donation"
      />
    );
  }

  const available = options.currencies.map((c) => c.currency);
  const currency: Currency =
    chosenCurrency && available.includes(chosenCurrency)
      ? chosenCurrency
      : available[0];
  const mode = options.currencies.find((c) => c.currency === currency)!;
  const bounds = DONATION_BOUNDS[currency];
  const suggested = SUGGESTED_DONATIONS[currency];
  // Preselected amount: the second suggested amount for the displayed
  // currency, as long as the donor has chosen nothing (or their choice
  // belonged to the other currency).
  const preset =
    chosenPreset === 'other' ||
    (chosenPreset !== null && suggested.includes(chosenPreset))
      ? chosenPreset
      : suggested[1];
  const email = values.email;

  const parsedOther = Number(values.other.replace(',', '.'));
  const amount = preset === 'other' ? parsedOther : preset;
  const amountValid =
    Number.isFinite(amount) && amount >= bounds.min && amount <= bounds.max;

  function switchCurrency(next: Currency) {
    setCurrency(next);
    // One currency's suggested amounts make no sense in the other.
    setPreset(null);
    setValue('other', '');
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const boundsMessage = t('errAmountBounds', {
      min: formatMajor(bounds.min, currency, locale),
      max: formatMajor(bounds.max, currency, locale),
    });
    if (
      !validate({
        other: () =>
          preset === 'other' && !amountValid ? boundsMessage : null,
        email: () => (isEmail(email) ? null : t('errEmail')),
        message: (v) => (v.length > MESSAGE_MAX ? t('errMessage') : null),
      })
    ) {
      return;
    }
    if (!amountValid) {
      setError(boundsMessage);
      return;
    }
    setPending(true);
    try {
      const captchaToken = await executeRecaptcha('donation');
      const { redirectUrl } = await start({
        currency,
        amount,
        recurring,
        email: email.trim(),
        name: values.name.trim() || undefined,
        anonymous,
        message: values.message.trim() || undefined,
        locale: resolveLocale(locale),
        captchaToken,
      });
      // Provider's hosted page (or simulator in development).
      window.location.assign(redirectUrl);
    } catch (err) {
      setError(vocabulary(t, 'err_', knownPaymentError(err)));
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label={t('formLabel')}
      className="space-y-6 rounded-md border border-line bg-surface p-6 shadow-card sm:p-8"
    >
      {options.simulated ? (
        <p
          role="note"
          className="rounded-sm border border-accent-edge bg-accent-tint px-3 py-2 text-sm text-accent-text"
        >
          {t('simulatedNotice')}
        </p>
      ) : null}

      {available.length > 1 ? (
        <fieldset>
          <legend className="text-sm text-ink-soft">
            {t('currencyLabel')}
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {available.map((c) => (
              <label
                key={c}
                className={`${PILL} ${currency === c ? PILL_ON : PILL_OFF}`}
              >
                <input
                  type="radio"
                  name="currency"
                  value={c}
                  checked={currency === c}
                  onChange={() => switchCurrency(c)}
                  className="sr-only"
                />
                {vocabulary(t, 'currency_', c)}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <fieldset>
        <legend className="text-sm text-ink-soft">{t('frequencyLabel')}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {[false, true].map((r) => (
            <label
              key={String(r)}
              className={`${PILL} ${recurring === r ? PILL_ON : PILL_OFF}`}
            >
              <input
                type="radio"
                name="frequency"
                value={r ? 'monthly' : 'once'}
                checked={recurring === r}
                onChange={() => setRecurring(r)}
                className="sr-only"
              />
              {r ? t('frequencyMonthly') : t('frequencyOnce')}
            </label>
          ))}
        </div>
        {recurring ? (
          <p className="mt-2 text-xs text-muted">
            {mode.recurringMode === 'native'
              ? t('monthlyNativeHint')
              : t('monthlyReminderHint')}
          </p>
        ) : null}
      </fieldset>

      <fieldset>
        <legend className="text-sm text-ink-soft">{t('amountLabel')}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {suggested.map((value) => (
            <label
              key={value}
              className={`${PILL} ${preset === value ? PILL_ON : PILL_OFF}`}
            >
              <input
                type="radio"
                name="amount"
                value={value}
                checked={preset === value}
                onChange={() => setPreset(value)}
                className="sr-only"
              />
              {formatMajor(value, currency, locale)}
            </label>
          ))}
          <label
            className={`${PILL} ${preset === 'other' ? PILL_ON : PILL_OFF}`}
          >
            <input
              type="radio"
              name="amount"
              value="other"
              checked={preset === 'other'}
              onChange={() => setPreset('other')}
              className="sr-only"
            />
            {t('amountOther')}
          </label>
        </div>
        {preset === 'other' ? (
          <TextField
            className="mt-3 max-w-xs"
            label={t('amountOtherLabel', { currency })}
            hint={t('amountBoundsHint', {
              min: formatMajor(bounds.min, currency, locale),
              max: formatMajor(bounds.max, currency, locale),
            })}
            type="number"
            inputMode="decimal"
            min={bounds.min}
            max={bounds.max}
            step={10 ** -CURRENCY_EXPONENT[currency]}
            required
            {...field('other')}
          />
        ) : null}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={t('emailLabel')}
          hint={t('emailHint')}
          type="email"
          autoComplete="email"
          required
          {...field('email')}
        />
        <TextField
          label={t('nameLabel')}
          autoComplete="name"
          maxLength={120}
          {...field('name')}
        />
      </div>

      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-ink-soft">
        <Checkbox
          checked={anonymous}
          onCheckedChange={(checked) => setAnonymous(checked === true)}
          className="mt-0.5"
        />
        <span>
          {t('anonymousLabel')}
          <span className="block text-xs text-muted">{t('anonymousHint')}</span>
        </span>
      </label>

      <TextareaField
        label={t('messageLabel')}
        rows={3}
        maxLength={MESSAGE_MAX}
        {...field('message')}
      />

      <FormError>{error}</FormError>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" disabled={pending}>
          {pending
            ? t('redirecting')
            : amountValid
              ? recurring
                ? t('submitMonthly', {
                    amount: formatMajor(amount, currency, locale),
                  })
                : t('submitOnce', {
                    amount: formatMajor(amount, currency, locale),
                  })
              : t('submit')}
        </Button>
        <p className="text-xs text-muted">
          {vocabulary(t, 'securedBy_', mode.provider)}
        </p>
      </div>
      <p className="text-xs leading-relaxed text-muted">{t('receiptNotice')}</p>
    </form>
  );
}
