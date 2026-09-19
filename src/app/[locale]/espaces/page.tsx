'use client';

import { useEffect } from 'react';
import { AuthGate } from '@/components/auth/auth-gate';
import {
  Authenticated,
  Unauthenticated,
  AuthLoading
} from 'convex/react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { WorkspacesBoard } from '@/components/workspaces/workspaces-board';
// Espaces de travail collaboratifs (F-24). Page gardée connecté ; le gating
// « membre réseau » est appliqué dans WorkspacesBoard (message dédié sinon).
export default function EspacesPage() {
  return (
    <AuthGate className="max-w-[960px]"><WorkspacesBoard /></AuthGate>
  );
}
