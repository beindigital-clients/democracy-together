'use client';

import { AuthGate } from '@/components/auth/auth-gate';
import { MemberDashboard } from '@/components/member/dashboard/member-dashboard';

// Member area home: the dashboard (see `member-dashboard.tsx` for what it
// shows and in which order). The shared shell — navigation, identity — comes
// from `espace-membre/layout.tsx`.
export default function EspaceMembrePage() {
  return (
    <AuthGate>
      <MemberDashboard />
    </AuthGate>
  );
}
