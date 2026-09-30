'use client';

import { useQuery } from 'convex/react';
import { Building2, Eye, PenLine, UserRoundPlus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { intlLocale } from '@/i18n/locale';
import { vocabulary } from '@/i18n/vocabulary';
import { isMember, isStaff } from '@/lib/roles';
import { memberName } from '@/lib/member-identity';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PersonAvatar } from '@/components/social/person-avatar';
import { useNow } from '@/hooks/use-now';

export type HeroData = {
  name: string | null;
  email: string | null;
  photoUrl: string | null;
  role: string;
  organization: { name: string; slug: string } | null;
  profile: { exists: boolean; handle: string; visibility: string };
};

// Top of the dashboard: who is signed in, and the two things one does with
// one's own profile (edit it, see it as others do).
//
// The `<h1>` reads "Espace membre. Bonjour, Awa Diop" to a screen reader and
// shows only the greeting: the tab title already says "Espace membre", but a
// heading that ONLY greeted would leave a screen-reader user landing on the
// page without the name of the place.
export function HeroView({ data, now }: { data: HeroData; now: number }) {
  const t = useTranslations('member');
  const ta = useTranslations('auth');
  const locale = useLocale();
  const today = new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);
  const { profile } = data;
  const canShowPublic =
    profile.exists && isMember(data.role) && profile.visibility !== 'private';

  return (
    <section
      aria-labelledby="dash-hero-title"
      className="relative isolate rounded-md border border-line bg-surface p-5 shadow-card sm:p-7"
    >
      {/* Decorative band: the accent tint, fading out — the only colour
          field of the page, and it carries no information. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-24 rounded-t-md bg-[linear-gradient(135deg,var(--accent-tint),transparent_70%)]"
      />
      <div className="flex flex-wrap items-center gap-5">
        <PersonAvatar
          name={data.name ?? data.email ?? ''}
          photoUrl={data.photoUrl}
          size={72}
          className="border-2 border-surface shadow-card"
        />
        <div className="min-w-0 flex-1 basis-[16rem]">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            {today}
          </p>
          <h1
            id="dash-hero-title"
            className="mt-1.5 wrap-anywhere font-display text-[clamp(28px,3.4vw,40px)] font-medium leading-[1.08] tracking-[-0.015em] text-ink"
          >
            <span className="sr-only">{t('heroTitleSr')} </span>
            {data.name
              ? t('greeting', { name: data.name })
              : t('greetingNoName')}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink-soft">
            <span className="inline-flex items-center rounded-pill border border-accent-edge bg-accent-tint px-2.5 py-0.5 text-xs font-medium text-accent-text">
              {vocabulary(ta, 'role_', data.role)}
            </span>
            {data.organization ? (
              <Link
                href={`/le-reseau/${data.organization.slug}`}
                className="inline-flex min-h-6 items-center gap-1.5 wrap-anywhere hover:text-ink hover:underline"
              >
                <Building2 aria-hidden="true" className="h-4 w-4 text-muted" />
                {data.organization.name}
              </Link>
            ) : null}
            {data.email && data.name ? (
              <span className="wrap-anywhere text-muted">{data.email}</span>
            ) : null}
          </p>
        </div>
      </div>

      <p className="mt-5 max-w-[62ch] text-[15px] leading-relaxed text-ink-soft">
        {/* The team's space is not about membership: its work waits in
            the block below and in the back office. */}
        {isStaff(data.role)
          ? t('heroLeadTeam')
          : isMember(data.role)
            ? t('heroLeadMember')
            : t('heroLeadVisitor')}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {profile.exists ? (
          <>
            <Button asChild variant="outline" className="min-h-11">
              <Link href="/espace-membre/profil">
                <PenLine aria-hidden="true" />
                {t('editProfile')}
              </Link>
            </Button>
            {canShowPublic ? (
              <Button asChild variant="ghost" className="min-h-11">
                <Link href={`/membres/${profile.handle}`}>
                  <Eye aria-hidden="true" />
                  {t('viewPublicProfile')}
                </Link>
              </Button>
            ) : null}
          </>
        ) : (
          <Button asChild className="min-h-11">
            <Link href="/espace-membre/profil">
              <UserRoundPlus aria-hidden="true" />
              {t('createProfileCta')}
            </Link>
          </Button>
        )}
      </div>
    </section>
  );
}

function HeroSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="rounded-md border border-line bg-surface p-5 sm:p-7"
    >
      <div className="flex items-center gap-5">
        <Skeleton className="h-[72px] w-[72px] rounded-full" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
    </div>
  );
}

export function DashboardHero() {
  const me = useQuery(api.users.current);
  const profile = useQuery(api.social.profiles.getMine);
  const now = useNow(60 * 60_000);
  if (me === undefined || profile === undefined) return <HeroSkeleton />;
  if (!me) return null;
  return (
    <HeroView
      now={now}
      data={{
        name: memberName({
          profileExists: Boolean(profile?.exists),
          profileName: profile?.displayName,
          accountName: me.name,
        }),
        email: me.email,
        photoUrl: profile?.photoUrl ?? null,
        role: me.role,
        organization: profile?.organization ?? null,
        profile: {
          exists: Boolean(profile?.exists),
          handle: profile?.handle ?? '',
          visibility: profile?.visibility ?? 'private',
        },
      }}
    />
  );
}
