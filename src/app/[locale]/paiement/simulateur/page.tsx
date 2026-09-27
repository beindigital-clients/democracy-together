import { setRequestLocale } from 'next-intl/server';
import { PaymentSimulator } from '@/components/payments/payment-simulator';

// Page de paiement du PRESTATAIRE FACTICE (développement, E2E). Hors
// développement, le serveur refuse la simulation et la page le dit.
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
