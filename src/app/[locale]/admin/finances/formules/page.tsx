'use client';

import { AdminPlans } from '@/components/payments/admin-plans';

// Membership plan pricing (F-27) — administrator rank, inherited from
// /admin/finances through the shell.
export default function AdminPlansPage() {
  return <AdminPlans />;
}
