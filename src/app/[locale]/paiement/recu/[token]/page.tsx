import { setRequestLocale } from 'next-intl/server';
import { ReceiptByToken } from '@/components/payments/receipt-by-token';

// Lien de reçu envoyé par courriel (F-29) : permet à un donateur SANS compte
// de retrouver son reçu. Le jeton est le seul sésame — cf.
// convex/payments/member.ts (`receiptByToken`).
export default async function ReceiptTokenPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  return (
    <div className="mx-auto max-w-xl px-4 py-14 sm:px-6">
      <ReceiptByToken token={token} />
    </div>
  );
}
