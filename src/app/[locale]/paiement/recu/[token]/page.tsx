import { setRequestLocale } from 'next-intl/server';
import { ReceiptByToken } from '@/components/payments/receipt-by-token';

// Receipt link sent by e-mail (F-29): lets a donor WITHOUT an account
// retrieve their receipt. The token is the only key — see
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
