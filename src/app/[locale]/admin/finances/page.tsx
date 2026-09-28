'use client';

import { AdminFinances } from '@/components/payments/admin-finances';

// Financial tracking (F-31) — administrator rank (Convex guard
// `requireNetworkRole(ctx, 'admin')`; the shell derives the 403 from it via
// `adminMinRoleForPath`).
export default function AdminFinancesPage() {
  return <AdminFinances />;
}
