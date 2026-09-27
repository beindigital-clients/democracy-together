'use client';

import { useParams } from 'next/navigation';
import { AuthGate, AuthGateLoading } from '@/components/auth/auth-gate';
import type { Id } from '@convex/_generated/dataModel';
import { PairDetail } from '@/components/mentoring/pair-detail';
import { PAGE } from '@/components/programmes/shared';

// Suivi d'un binôme (F-59). Lisible par ses deux membres et le coordinateur :
// la garde est côté Convex (`mentoring.getPair`), cette page ne protège rien.
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
