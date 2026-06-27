'use client';

import { type ReactNode, useEffect } from 'react';
import {
  Authenticated,
  Unauthenticated,
  AuthLoading,
  useQuery,
} from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { isStaff, isAdmin, isEditor } from '@/lib/roles';

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center sm:px-6">
      {children}
    </div>
  );
}

function Loading() {
  const t = useTranslations('admin');
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-16 text-ink-soft sm:px-6">
      {t('loading')}
    </div>
  );
}

function RedirectToSignIn() {
  const router = useRouter();
  useEffect(() => {
    const id = setTimeout(() => router.replace('/connexion'), 1200);
    return () => clearTimeout(id);
  }, [router]);
  return <Loading />;
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

function AdminNav({
  isAdmin,
  isEditor,
}: {
  isAdmin: boolean;
  isEditor: boolean;
}) {
  const t = useTranslations('admin');
  const pathname = usePathname();
  const items = [
    { href: '/admin', key: 'dashboard' },
    { href: '/admin/impact', key: 'impact' },
    { href: '/admin/candidatures', key: 'applications' },
    { href: '/admin/publications', key: 'publications' },
    { href: '/admin/evenements', key: 'events' },
    { href: '/admin/jeunes', key: 'youth' },
    { href: '/admin/mentorat', key: 'mentorship' },
    { href: '/admin/projets', key: 'projects' },
    { href: '/admin/signalements', key: 'reports' },
    ...(isEditor ? [{ href: '/admin/newsletter', key: 'newsletter' }] : []),
    ...(isAdmin
      ? [
          { href: '/admin/utilisateurs', key: 'users' },
          { href: '/admin/journal', key: 'journal' },
        ]
      : []),
  ];
  return (
    <nav
      aria-label={t('title')}
      className="-mx-1 flex gap-1 overflow-x-auto border-b border-line"
    >
      {items.map(({ href, key }) => {
        // actif = chemin exact (le dashboard ne doit pas s'allumer partout)
        const active =
          href === '/admin'
            ? pathname === '/admin'
            : pathname.startsWith(href);
        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors ${
              active
                ? 'border-accent-text text-ink'
                : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const me = useQuery(api.users.current);
  if (me === undefined) return <Loading />;
  if (!isStaff(me?.role)) return <AccessDenied />;

  const admin = isAdmin(me?.role);
  const editor = isEditor(me?.role);
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6">
      <AdminNav isAdmin={admin} isEditor={editor} />
      <div className="mt-8">{children}</div>
    </div>
  );
}

// Coquille du back-office : gère l'authentification puis le gate de rôle
// (modérateur minimum). Les pages enfant ne se montent que pour le staff.
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <>
      <AuthLoading>
        <Loading />
      </AuthLoading>
      <Unauthenticated>
        <RedirectToSignIn />
      </Unauthenticated>
      <Authenticated>
        <Gate>{children}</Gate>
      </Authenticated>
    </>
  );
}
