'use client';

import { type ReactNode } from 'react';
import { useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link, usePathname } from '@/i18n/navigation';
import { effectiveRole, isStaff } from '@/lib/roles';
import { AuthGate, AuthGateLoading } from '@/components/auth/auth-gate';
import { AdminNav } from '@/components/admin/admin-nav';

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center sm:px-6">
      {children}
    </div>
  );
}

function AccessDenied() {
  const t = useTranslations('admin');
  return (
    <Centered>
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
        403
      </p>
      <h1 className="mt-3 font-display text-3xl">{t('accessDeniedTitle')}</h1>
      <p className="mt-3 text-ink-soft">{t('accessDeniedBody')}</p>
      <Link
        href="/"
        className="mt-6 inline-block text-sm font-medium text-accent-text hover:underline"
      >
        {t('backHome')}
      </Link>
    </Centered>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const me = useQuery(api.users.current);
  const pathname = usePathname();
  if (me === undefined) return <AuthGateLoading className="max-w-[1100px]" />;
  if (!isStaff(me?.role)) return <AccessDenied />;

  // COLONNE LATÉRALE à partir de `lg`, groupes empilés en dessous (issue #49) :
  // la navigation ne partage plus sa largeur avec les quatorze entrées, donc
  // rien ne part hors écran. `minmax(0, 1fr)` sur la colonne de contenu, sinon
  // les tables à défilement horizontal (utilisateurs, journal) élargiraient la
  // grille au lieu de défiler dans leur propre boîte.
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6">
      <div className="lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:items-start lg:gap-10">
        <AdminNav role={effectiveRole(me?.role)} pathname={pathname} />
        <div className="mt-8 lg:mt-0">{children}</div>
      </div>
    </div>
  );
}

// Coquille du back-office : gère l'authentification puis le gate de rôle
// (modérateur minimum). Les pages enfant ne se montent que pour le staff.
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <AuthGate className="max-w-[1100px]">
      <Gate>{children}</Gate>
    </AuthGate>
  );
}
