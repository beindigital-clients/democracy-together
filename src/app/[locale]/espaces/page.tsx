'use client';

import { AuthGate } from '@/components/auth/auth-gate';
import { WorkspacesBoard } from '@/components/workspaces/workspaces-board';
// Collaborative workspaces (F-24). Sign-in-guarded page; the "network
// member" gating is applied in WorkspacesBoard (dedicated message otherwise).
export default function EspacesPage() {
  return (
    <AuthGate className="max-w-[960px]">
      <WorkspacesBoard />
    </AuthGate>
  );
}
