'use client';

import { useQuery } from 'convex/react';
import {
  Database,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowForward } from '@/components/ui/arrow';
import { DashCard } from './dash-card';

export type SecurityState = { enabled: boolean; required: boolean };

function Row({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: LucideIcon;
  children: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-11 items-center gap-3 rounded-sm px-2 text-sm text-ink transition-colors hover:bg-surface-2"
      >
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1">{children}</span>
        <ArrowForward />
      </Link>
    </li>
  );
}

// Account security at a glance: whether the second factor is on (and
// whether this account MUST have it), then the three screens where the
// account is protected or taken away.
export function SecurityView({ state }: { state: SecurityState | undefined }) {
  const t = useTranslations('member');
  const ta = useTranslations('auth');
  const tAccounts = useTranslations('accounts');
  const ok = state?.enabled ?? false;
  return (
    <DashCard
      titleId="dash-security-title"
      title={t('securityTitle')}
      icon={ShieldCheck}
    >
      {state === undefined ? (
        <Skeleton className="h-12 w-full" />
      ) : (
        <p
          className={cn(
            'flex items-start gap-2.5 rounded-sm border px-3 py-2.5 text-sm',
            ok
              ? 'border-[color-mix(in_srgb,var(--color-bar-1)_40%,transparent)] text-ink'
              : 'border-[color-mix(in_srgb,var(--color-bar-4)_45%,transparent)] text-ink',
          )}
        >
          {ok ? (
            <ShieldCheck
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-bar-1"
            />
          ) : (
            <ShieldAlert
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-bar-4-ink"
            />
          )}
          <span>
            {ok ? t('security2faOn') : t('security2faOff')}
            {state.required && !ok ? (
              <span className="mt-0.5 block text-xs text-ink-soft">
                {t('security2faRequired')}
              </span>
            ) : null}
          </span>
        </p>
      )}
      {/* The three labels are the ones the old member area used: the
          journeys that start here (2FA enrolment, setting a password)
          are described with them, in the messages and the tests alike. */}
      <ul className="-mx-2 mt-3">
        <Row href="/espace-membre/securite" icon={ShieldCheck}>
          {tAccounts('linkSecurity')}
        </Row>
        <Row href="/espace-membre/mot-de-passe" icon={KeyRound}>
          {ta('passwordLink')}
        </Row>
        <Row href="/espace-membre/donnees" icon={Database}>
          {tAccounts('linkData')}
        </Row>
      </ul>
    </DashCard>
  );
}

export function SecurityCard() {
  const status = useQuery(api.twoFactor.status);
  return (
    <SecurityView
      state={
        status
          ? { enabled: status.enabled, required: status.required }
          : undefined
      }
    />
  );
}
