'use client';

import { AdminFinances } from '@/components/payments/admin-finances';

// Suivi financier (F-31) — rang administrateur (garde Convex
// `requireNetworkRole(ctx, 'admin')` ; la coquille en dérive le 403 par
// `adminMinRoleForPath`).
export default function AdminFinancesPage() {
  return <AdminFinances />;
}
