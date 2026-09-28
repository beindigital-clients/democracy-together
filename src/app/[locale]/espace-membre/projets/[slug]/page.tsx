'use client';

import { useParams } from 'next/navigation';
import { AuthGate, AuthGateLoading } from '@/components/auth/auth-gate';
import { CallApplication } from '@/components/projects/call-application';
import { PAGE } from '@/components/programmes/shared';

// Application to a call (F-60): draft, attachments, submission.
function Detail() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;
  if (!slug) return <AuthGateLoading className="max-w-3xl" />;
  return (
    <div className={PAGE}>
      <CallApplication slug={slug} />
    </div>
  );
}

export default function CallApplicationPage() {
  return (
    <AuthGate className="max-w-3xl">
      <Detail />
    </AuthGate>
  );
}
