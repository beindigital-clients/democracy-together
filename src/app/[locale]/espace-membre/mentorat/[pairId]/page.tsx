'use client';

import { useParams } from 'next/navigation';
import { AuthGate, AuthGateLoading } from '@/components/auth/auth-gate';
import type { Id } from '@convex/_generated/dataModel';
import { PairDetail } from '@/components/mentoring/pair-detail';
import { PAGE } from '@/components/programmes/shared';

// Tracking of a mentoring pair (F-59). Readable by its two members and the
// coordinator: the guard is on the Convex side (`mentoring.getPair`), this
// page protects nothing.
function Detail() {
  const params = useParams<{ pairId: string }>();
  const id = params?.pairId;
  if (!id) return <AuthGateLoading className="max-w-3xl" />;
  return (
    <div className={PAGE}>
      <PairDetail pairId={id as Id<'mentorPairs'>} />
    </div>
  );
}

export default function PairPage() {
  return (
    <AuthGate className="max-w-3xl">
      <Detail />
    </AuthGate>
  );
}
