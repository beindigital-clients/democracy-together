'use client';

import { useEffect, type ReactNode } from 'react';
import { useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link, usePathname } from '@/i18n/navigation';
import { effectiveRole, isReviewChief, isStaff, roleRank } from '@/lib/roles';
import { AuthGate, AuthGateLoading } from '@/components/auth/auth-gate';
import {
  AdminNav,
  adminMinRoleForPath,
  adminPathRequiresReviewChief,
  adminScreenKey,
} from '@/components/admin/admin-nav';
import { SITE_NAME } from '@/lib/seo';
import { ActionFeedbackProvider } from '@/components/admin/action-feedback';

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center sm:px-6">
      {children}
    </div>
  );
}

function AccessDenied({ rank = false }: { rank?: boolean }) {
  const t = useTranslations('admin');
  return (
    <Centered>
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
        403
      </p>
      <h1 className="mt-3 font-display text-3xl">{t('accessDeniedTitle')}</h1>
      <p className="mt-3 text-ink-soft">
        {rank ? t('accessDeniedBodyRank') : t('accessDeniedBody')}
      </p>
      <Link
        href="/"
        className="mt-6 inline-block text-sm font-medium text-accent-text hover:underline"
      >
        {t('backHome')}
      </Link>
    </Centered>
  );
}

// Tab title per screen (RGAA 8.6): "Utilisateurs · Administration ·
// Democracy Together". `admin/layout.tsx` serves "Administration" in the
// initial HTML; the effect specifies the screen once the route is known on
// the client. It depends on the path: an internal back-office navigation,
// which does not change the layout's metadata, still replays it. It also
// replays when the session is known (`loading`): since metadata is streamed,
// a layout `<title>` arriving AFTER the first pass would have overwritten it.
function useAdminDocumentTitle(pathname: string, loading: boolean) {
  const t = useTranslations('admin');
  const key = adminScreenKey(pathname);
  const screen = key ? t(key) : null;
  const admin = t('title');
  useEffect(() => {
    document.title = [screen, admin, SITE_NAME].filter(Boolean).join(' · ');
  }, [screen, admin, loading]);
}

function Gate({ children }: { children: ReactNode }) {
  const me = useQuery(api.users.current);
  const pathname = usePathname();
  // The dashboard's own counters (denormalized: a few indexed reads), shared
  // with the dashboard page when it is open. They put the work waiting next
  // to each queue in the menu — reactive, so a new application shows up
  // while the moderator is on another screen.
  const stats = useQuery(
    api.admin.dashboardStats,
    isStaff(me?.role) ? {} : 'skip',
  );
  useAdminDocumentTitle(pathname, me === undefined);
  if (me === undefined) return <AuthGateLoading className="max-w-[1100px]" />;
  if (!isStaff(me?.role)) return <AccessDenied />;
  // Rank of the SCREEN, not just of the back office: the child page is not
  // mounted — hence makes no request — if the role is insufficient.
  if (roleRank(me?.role) < roleRank(adminMinRoleForPath(pathname))) {
    return <AccessDenied rank />;
  }
  // Screens reserved to the review chief function (KOHOP queue): same rule as
  // the server guard `requireReviewChief`.
  if (adminPathRequiresReviewChief(pathname) && !isReviewChief(me ?? {})) {
    return <AccessDenied rank />;
  }

  // The action-feedback live regions are mounted HERE, once for the whole
  // back office: each moderation screen pushes its message into them
  // rather than placing one in each queue (issue #38).
  //
  // SIDE COLUMN from `lg` up, stacked groups below (issue #49):
  // the navigation no longer shares its width with the fourteen entries, so
  // nothing goes off screen. `minmax(0, 1fr)` on the content column, otherwise
  // the horizontally scrolling tables (users, log) would widen the
  // grid instead of scrolling within their own box.
  return (
    <ActionFeedbackProvider>
      <div className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6">
        <div className="lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:items-start lg:gap-10">
          <AdminNav
            role={effectiveRole(me?.role)}
            reviewChief={me?.reviewChief === true}
            pathname={pathname}
            counts={{
              applications: stats?.pendingApplications,
              publications: stats?.pendingPublications,
              contactMessages: stats?.unhandledContacts,
            }}
          />
          <div className="mt-8 lg:mt-0">{children}</div>
        </div>
      </div>
    </ActionFeedbackProvider>
  );
}

// Back-office shell: handles authentication then the role gate
// (moderator minimum). Child pages are only mounted for staff.
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <AuthGate className="max-w-[1100px]">
      <Gate>{children}</Gate>
    </AuthGate>
  );
}
