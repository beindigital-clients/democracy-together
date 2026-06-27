import type { ReactNode } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { AdminShell } from '@/components/admin/admin-shell';

export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AdminShell>{children}</AdminShell>;
}
