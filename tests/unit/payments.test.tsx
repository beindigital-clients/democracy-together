// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import fr from '@/messages/fr.json';
import en from '@/messages/en.json';
import ar from '@/messages/ar.json';
import { PaymentsUnavailable } from '@/components/payments/payments-unavailable';
import { formatMoney, knownPaymentError } from '@/components/payments/format';
import { ConvexError } from 'convex/values';
import {
  CURRENCIES,
  addMonthsUtc,
  defaultPlanAmounts,
  DONATION_BOUNDS,
  formatAmountFr,
  isDonationAmountValid,
  monthKey,
  PLAN_CATEGORIES,
  PLAN_ZONES,
  SUGGESTED_DONATIONS,
  toMinor,
} from '@convex/lib/payments/amounts';

afterEach(cleanup);

// Règles PURES des paiements (montants, dates, texte du reçu) et l'écran
// « aucun prestataire » — celui qui doit proposer une alternative au lieu
// d'un bouton mort.

describe('Montants — unité mineure', () => {
  it('convertit sans flottant parasite et refuse les décimales impossibles', () => {
    expect(toMinor(19.99, 'EUR')).toBe(1999);
    expect(toMinor(0.1 + 0.2, 'EUR')).toBe(30);
    expect(toMinor(20.001, 'EUR')).toBeNull();
    expect(toMinor(1500, 'USD')).toBe(150000);
    expect(toMinor(19.999, 'USD')).toBeNull();
    expect(toMinor(Number.NaN, 'EUR')).toBeNull();
  });

  it('les montants suggérés respectent les bornes de leur devise', () => {
    for (const currency of CURRENCIES) {
      for (const major of SUGGESTED_DONATIONS[currency]) {
        expect(isDonationAmountValid(toMinor(major, currency)!, currency)).toBe(
          true,
        );
      }
      const { min, max } = DONATION_BOUNDS[currency];
      expect(isDonationAmountValid(toMinor(min, currency)! - 1, currency)).toBe(
        false,
      );
      expect(isDonationAmountValid(toMinor(max, currency)! + 1, currency)).toBe(
        false,
      );
    }
  });

  it('barème par défaut : neuf formules, décroissant avec le revenu, même chiffre rond en dollars', () => {
    for (const c of PLAN_CATEGORIES) {
      const [high, mid, low] = PLAN_ZONES.map((z) => defaultPlanAmounts(c, z));
      expect(high.amountEur).toBeGreaterThanOrEqual(mid.amountEur);
      expect(mid.amountEur).toBeGreaterThanOrEqual(low.amountEur);
      for (const p of [high, mid, low]) {
        expect(p.amountEur).toBeGreaterThanOrEqual(500);
        expect(p.amountUsd).toBe(p.amountEur);
        expect(p.amountEur % 500).toBe(0);
      }
    }
    expect(defaultPlanAmounts('org', 'high')).toEqual({
      amountEur: 120000,
      amountUsd: 120000,
    });
  });
});

describe('Dates des échéances', () => {
  it('ajoute des mois calendaires en ramenant au dernier jour du mois', () => {
    expect(new Date(addMonthsUtc(Date.UTC(2026, 0, 31), 1)).toISOString()).toBe(
      '2026-02-28T00:00:00.000Z',
    );
    expect(new Date(addMonthsUtc(Date.UTC(2028, 0, 31), 1)).toISOString()).toBe(
      '2028-02-29T00:00:00.000Z',
    );
    expect(
      new Date(addMonthsUtc(Date.UTC(2026, 8, 27, 10), 12)).toISOString(),
    ).toBe('2027-09-27T10:00:00.000Z');
    expect(monthKey(Date.UTC(2026, 8, 30, 23, 59))).toBe('2026-09');
  });
});

describe('Reçu PDF — texte', () => {
  it('formate en français sans espace fine (police standard du PDF)', () => {
    expect(formatAmountFr(123456, 'EUR')).toBe('1 234,56 €');
    expect(formatAmountFr(2500000, 'USD')).toBe('25 000,00 $ US');
    expect(formatAmountFr(500, 'EUR')).toBe('5,00 €');
  });
  // Les noms hors Latin-1 (arabe, vietnamien…) : convex/lib/payments/
  // receiptPdf.test.ts, depuis que le reçu embarque ses polices (27/09).
});

describe('Montants à l’écran', () => {
  it('suit la langue de la page, chiffres occidentaux en arabe', () => {
    expect(formatMoney(5000, 'EUR', 'en')).toMatch(/EUR\s?50\.00/);
    expect(formatMoney(2500000, 'USD', 'ar')).toMatch(/USD/);
    expect(formatMoney(2500000, 'USD', 'ar')).toMatch(
      /25[.,\s\u202F\u00A0]?000/,
    );
  });

  it('un code de refus inconnu retombe sur le message générique', () => {
    expect(knownPaymentError(new ConvexError('AMOUNT_OUT_OF_BOUNDS'))).toBe(
      'AMOUNT_OUT_OF_BOUNDS',
    );
    expect(knownPaymentError(new ConvexError('XYZ'))).toBe('GENERIC');
    expect(knownPaymentError(new Error('boom'))).toBe('GENERIC');
  });
});

describe('Aucun prestataire configuré — l’écran propose une alternative', () => {
  function renderIn(
    locale: string,
    messages: Record<string, unknown>,
    bank: boolean,
  ) {
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <PaymentsUnavailable
          purpose="donation"
          bankTransfer={
            bank
              ? {
                  holder: 'Democracy Together',
                  iban: 'FR76 3000 6000 0112 3456 7890 189',
                  bic: 'AGRIFRPP',
                  bank: null,
                }
              : null
          }
        />
      </NextIntlClientProvider>,
    );
  }

  it('sans coordonnées bancaires : le contact, et aucun bouton', () => {
    renderIn('fr', fr, false);
    expect(
      screen.getByRole('heading', {
        name: 'Le paiement en ligne n’est pas encore ouvert',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'contactez-nous' }).getAttribute('href'),
    ).toContain('/contact');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('IBAN')).toBeNull();
  });

  it('avec coordonnées : l’IBAN, isolé en LTR même dans une page arabe', () => {
    renderIn('ar', ar, true);
    const iban = screen.getByText('FR76 3000 6000 0112 3456 7890 189');
    expect(iban.getAttribute('dir')).toBe('ltr');
  });

  it('traduit en anglais (aucune clé brute)', () => {
    renderIn('en', en, true);
    expect(
      screen.getByRole('heading', { name: 'Online payment is not open yet' }),
    ).toBeTruthy();
    expect(screen.getByText('By bank transfer')).toBeTruthy();
  });
});
