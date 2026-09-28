import { setRequestLocale } from 'next-intl/server';
import { PaymentSimulator } from '@/components/payments/payment-simulator';

// Payment page of the FAKE PROVIDER (development, E2E). Outside
// development, the server refuses the simulation and the page says so.
export default async function PaymentSimulatorPage({
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
  return (
    <div className="mx-auto max-w-xl px-4 py-14 sm:px-6">
      <PaymentSimulator paymentRef={ref} />
    </div>
  );
}
