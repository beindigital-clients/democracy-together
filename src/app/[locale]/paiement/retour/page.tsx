import { setRequestLocale } from 'next-intl/server';
import { PaymentReturn } from '@/components/payments/payment-return';

// Return from the provider after payment (or cancellation). The page asserts
// NOTHING based on the URL: `statut` only says through which door the browser
// came back; the actual state is read from the database (webhook) and
// re-checked with the provider if the webhook is late.
export default async function PaymentReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const ref = typeof sp.ref === 'string' ? sp.ref : '';
  const cancelled = sp.statut === 'annule';
  return (
    <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
      <PaymentReturn paymentRef={ref} cancelled={cancelled} />
    </div>
  );
}
