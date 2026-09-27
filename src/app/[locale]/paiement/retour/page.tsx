import { setRequestLocale } from 'next-intl/server';
import { PaymentReturn } from '@/components/payments/payment-return';

// Retour du prestataire après paiement (ou annulation). La page n'affirme
// RIEN d'après l'URL : `statut` dit seulement par quelle porte le navigateur
// est revenu ; l'état réel est lu en base (webhook) et relu chez le
// prestataire si le webhook tarde.
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
