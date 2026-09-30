'use client';

import type { ReactNode } from 'react';
import { useQuery } from 'convex/react';
import { HeartHandshake } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { isMember, isStaff } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import { AuthGateLoading } from '@/components/auth/auth-gate';
import { WidgetBoundary } from '@/components/member/widget-boundary';
import { DashCardError } from './dash-card';
import { DashboardHero } from './hero';
import { StaffPanel } from './staff-panel';
import { ProfileCompletionCard } from './profile-completion-card';
import { StatTiles } from './stat-tiles';
import { RecentPublications } from './recent-publications';
import { TribuneSummary } from './tribune-summary';
import { ActivityPanel } from './activity-panel';
import { MembershipCard } from './membership-card';
import { SecurityCard } from './security-card';
import { ProgrammesGrid } from './programmes-grid';

// Each block in its own error boundary: one failed read costs one block.
function Block({ children }: { children: ReactNode }) {
  const t = useTranslations('member');
  return (
    <WidgetBoundary fallback={<DashCardError message={t('widgetError')} />}>
      {children}
    </WidgetBoundary>
  );
}

// Visitor (signed in, membership not approved): the invitation to apply, in
// place of the blocks that only make sense for a member.
function BecomeMember() {
  const t = useTranslations('auth');
  return (
    <section
      aria-labelledby="dash-join-title"
      className="flex flex-wrap items-start gap-5 rounded-md border border-accent-edge bg-accent-tint p-5 sm:p-6"
    >
      <span
        aria-hidden="true"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-sm bg-accent text-accent-contrast"
      >
        <HeartHandshake className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1 basis-[18rem]">
        <h2
          id="dash-join-title"
          className="font-display text-[21px] leading-tight text-ink"
        >
          {t('becomeMemberTitle')}
        </h2>
        <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-ink-soft">
          {t('becomeMemberBody')}
        </p>
        <Button asChild className="mt-4 min-h-11">
          <Link href="/adhesion">{t('becomeMemberCta')}</Link>
        </Button>
      </div>
    </section>
  );
}

// THE DASHBOARD — the home of the member area.
//
// Order of the page, and why:
//  1. who is signed in, and their profile (the question "am I in the right
//     place?", then the most frequent action);
//  2. for the team: what waits for a decision — they come here to work;
//  3. what is left to do on the profile, while something is;
//  4. four numbers that call for action (unread) or tell the reach
//     (followers);
//  5. the member's own output, next to what happened around them;
//  6. the account (membership, security) and the programmes.
export function MemberDashboard() {
  const me = useQuery(api.users.current);
  if (me === undefined) return <AuthGateLoading />;
  if (!me) return null;
  const member = isMember(me.role);
  const staff = isStaff(me.role);

  return (
    <div className="space-y-6">
      <Block>
        <DashboardHero />
      </Block>

      {staff ? (
        <Block>
          <StaffPanel role={me.role} />
        </Block>
      ) : null}

      {member ? null : <BecomeMember />}

      <Block>
        <ProfileCompletionCard />
      </Block>

      <Block>
        <StatTiles />
      </Block>

      {/* Wide column: the member's own work (or, for a visitor, what
          happened around them); narrow column: the activity feed and the
          account. Below `xl` the two stack, own work first. */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] xl:items-start">
        <div className="min-w-0 space-y-6">
          {member ? (
            <>
              <Block>
                <RecentPublications />
              </Block>
              <Block>
                <TribuneSummary />
              </Block>
              <Block>
                <MembershipCard />
              </Block>
            </>
          ) : (
            <Block>
              <ActivityPanel member={false} />
            </Block>
          )}
        </div>
        <div className="min-w-0 space-y-6">
          {member ? (
            <Block>
              <ActivityPanel member />
            </Block>
          ) : null}
          <Block>
            <SecurityCard />
          </Block>
        </div>
      </div>

      <ProgrammesGrid role={me.role} />
    </div>
  );
}
