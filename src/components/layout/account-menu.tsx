'use client';

import { useConvexAuth, useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import {
  ChevronDown,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  MessagesSquare,
  Settings2,
  ShieldCheck,
  UserRound,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link, useRouter } from '@/i18n/navigation';
import { directionOf } from '@/i18n/direction';
import { vocabulary } from '@/i18n/vocabulary';
import { isMember, isStaff } from '@/lib/roles';
import { memberName } from '@/lib/member-identity';
import { cn } from '@/lib/utils';
import { PersonAvatar } from '@/components/social/person-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ACCOUNT MENU of the header — the signed-in person's photo, opening onto
// their space, the way social networks do it (LinkedIn's "Me", the avatar of
// X or Facebook).
//
// It replaces the two text links "Espace membre · Déconnexion": the header
// lost 170 px of words, and the account gained what one looks for from any
// page — one's profile, messages, network, settings — in one click.
//
// F-13 STILL HOLDS. `connecteAuRendu` comes from the SERVER: signed in, the
// served HTML already carries the trigger at its final size (a 32 px circle
// and a chevron), the photo filling it once Convex answers. Nothing in the
// right-hand cluster moves on hydration.

// Width of the trigger, reserved while the auth state is unknown.
const TRIGGER = 'h-9 w-[3.25rem]';

type Entry = {
  key: string;
  href: string;
  icon: LucideIcon;
  label: string;
  count?: number;
};

function AccountMenuContent() {
  const t = useTranslations('auth');
  const router = useRouter();
  const { signOut } = useAuthActions();
  const me = useQuery(api.users.current);
  const profile = useQuery(api.social.profiles.getMine);
  const unread = useQuery(api.social.messages.unreadSummary);

  // SIGN-OUT NAVIGATES BY ITSELF (auth A-6): a clean route right after, so
  // the guard of a private page never has to redirect, and the history
  // keeps no URL that cannot be shared.
  async function onSignOut() {
    await signOut();
    router.replace('/');
  }

  const role = me?.role ?? null;
  const name =
    memberName({
      profileExists: Boolean(profile?.exists),
      profileName: profile?.displayName,
      accountName: me?.name,
    }) ??
    me?.email ??
    '';
  const publicPage =
    profile?.exists && isMember(role) && profile.visibility !== 'private'
      ? `/membres/${profile.handle}`
      : null;

  const main: Entry[] = [
    {
      key: 'dashboard',
      href: '/espace-membre',
      icon: LayoutDashboard,
      label: t('accountDashboard'),
    },
    {
      key: 'profile',
      href: '/espace-membre/profil',
      icon: UserRound,
      label: t('accountProfile'),
    },
    {
      key: 'messages',
      href: '/espace-membre/messages',
      icon: MessagesSquare,
      label: t('accountMessages'),
      count: unread?.count,
    },
    {
      key: 'network',
      href: '/espace-membre/reseau',
      icon: UsersRound,
      label: t('accountNetwork'),
    },
    ...(isMember(role)
      ? [
          {
            key: 'publications',
            href: '/espace-membre/publications',
            icon: FileText,
            label: t('accountPublications'),
          },
        ]
      : []),
  ];
  const account: Entry[] = [
    {
      key: 'security',
      href: '/espace-membre/securite',
      icon: ShieldCheck,
      label: t('accountSecurity'),
    },
    // Dues and donations: not the team's business (`member-nav.ts`).
    ...(isStaff(role)
      ? []
      : [
          {
            key: 'payments',
            href: '/espace-membre/cotisations',
            icon: CreditCard,
            label: t('accountPayments'),
          },
        ]),
    ...(isStaff(role)
      ? [
          {
            key: 'admin',
            href: '/admin',
            icon: Settings2,
            label: t('accountAdmin'),
          },
        ]
      : []),
  ];

  const item = (e: Entry) => (
    <DropdownMenuItem key={e.key} asChild>
      <Link href={e.href}>
        <e.icon aria-hidden="true" />
        <span className="min-w-0 flex-1">{e.label}</span>
        {e.count ? (
          <span className="rounded-pill bg-accent px-1.5 font-mono text-[11px] font-semibold leading-5 text-accent-contrast">
            {unread?.capped ? `${e.count}+` : e.count}
          </span>
        ) : null}
      </Link>
    </DropdownMenuItem>
  );

  return (
    <DropdownMenuContent align="end" className="w-72 p-1.5">
      {/* Who is signed in. Not a menu item: a card, then its one action. */}
      <div className="flex items-center gap-3 px-2 pb-2 pt-1.5">
        <PersonAvatar
          name={name}
          photoUrl={profile?.photoUrl ?? null}
          size={44}
        />
        <div className="min-w-0">
          <p className="wrap-anywhere text-sm font-medium leading-snug text-ink">
            {name}
          </p>
          {role ? (
            <p className="mt-0.5 text-xs text-muted">
              {vocabulary(t, 'role_', role)}
            </p>
          ) : null}
        </div>
      </div>
      <DropdownMenuItem
        asChild
        className="mx-1 mb-1 justify-center rounded-sm border border-line-strong py-1.5 text-sm font-medium text-accent-text data-highlighted:bg-accent-tint data-highlighted:text-accent-text"
      >
        <Link href={publicPage ?? '/espace-membre/profil'}>
          {publicPage
            ? t('accountViewProfile')
            : profile?.exists
              ? t('accountEditProfile')
              : t('accountCreateProfile')}
        </Link>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>{main.map(item)}</DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>{account.map(item)}</DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => void onSignOut()}>
        <LogOut aria-hidden="true" />
        {t('signOut')}
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

// The trigger: the person's photo (or initials), a chevron, and a name read
// by screen readers only — "Mon compte".
function Trigger() {
  const t = useTranslations('auth');
  const me = useQuery(api.users.current);
  const profile = useQuery(api.social.profiles.getMine);
  const name =
    memberName({
      profileExists: Boolean(profile?.exists),
      profileName: profile?.displayName,
      accountName: me?.name,
    }) ??
    me?.email ??
    '';
  return (
    <DropdownMenuTrigger
      className={cn(
        'group inline-flex items-center justify-center gap-1 rounded-pill ps-0.5 pe-1.5 text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink data-[state=open]:bg-surface-2 data-[state=open]:text-ink',
        TRIGGER,
      )}
    >
      {me === undefined ? (
        <span
          aria-hidden="true"
          className="h-8 w-8 shrink-0 rounded-full border border-line bg-surface-2"
        />
      ) : (
        <PersonAvatar
          name={name}
          photoUrl={profile?.photoUrl ?? null}
          size={32}
        />
      )}
      <ChevronDown
        aria-hidden="true"
        className="h-3.5 w-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180"
      />
      <span className="sr-only">{t('accountMenu')}</span>
    </DropdownMenuTrigger>
  );
}

export function AccountMenu({
  connecteAuRendu,
}: {
  connecteAuRendu?: boolean;
} = {}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const t = useTranslations('auth');
  const locale = useLocale();
  const connecte = isLoading ? connecteAuRendu : isAuthenticated;

  // Not known yet, and the server did not say: reserve the space.
  if (connecte === undefined) {
    return <span aria-hidden className={cn('inline-block', TRIGGER)} />;
  }
  if (!connecte) {
    return (
      <Link
        href="/connexion"
        className="text-sm text-ink-soft transition-colors hover:text-ink"
      >
        {t('signIn')}
      </Link>
    );
  }
  return (
    <DropdownMenu modal={false} dir={directionOf(locale)}>
      <Trigger />
      {/* The menu's reads only start when it is signed in. */}
      {isAuthenticated ? <AccountMenuContent /> : null}
    </DropdownMenu>
  );
}

// Phone version, at the top of the mobile menu panel: who is signed in and
// the four places one goes to most — the same account, at a thumb's reach.
export function MobileAccountCard({ onNavigate }: { onNavigate: () => void }) {
  const t = useTranslations('auth');
  const { isAuthenticated } = useConvexAuth();
  const skip = isAuthenticated ? {} : 'skip';
  const me = useQuery(api.users.current, skip);
  const profile = useQuery(api.social.profiles.getMine, skip);
  const unread = useQuery(api.social.messages.unreadSummary, skip);
  if (!isAuthenticated || !me) return null;
  const name =
    memberName({
      profileExists: Boolean(profile?.exists),
      profileName: profile?.displayName,
      accountName: me.name,
    }) ??
    me.email ??
    '';
  const links: Entry[] = [
    {
      key: 'dashboard',
      href: '/espace-membre',
      icon: LayoutDashboard,
      label: t('accountDashboard'),
    },
    {
      key: 'profile',
      href: '/espace-membre/profil',
      icon: UserRound,
      label: t('accountProfile'),
    },
    {
      key: 'messages',
      href: '/espace-membre/messages',
      icon: MessagesSquare,
      label: t('accountMessages'),
      count: unread?.count,
    },
    {
      key: 'network',
      href: '/espace-membre/reseau',
      icon: UsersRound,
      label: t('accountNetwork'),
    },
  ];
  return (
    <div className="mt-3 rounded-md border border-line bg-surface p-3">
      <div className="flex items-center gap-3">
        <PersonAvatar
          name={name}
          photoUrl={profile?.photoUrl ?? null}
          size={44}
        />
        <div className="min-w-0">
          <p className="wrap-anywhere font-medium leading-snug text-ink">
            {name}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {vocabulary(t, 'role_', me.role)}
          </p>
        </div>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-2">
        {links.map((l) => (
          <li key={l.key}>
            <Link
              href={l.href}
              onClick={onNavigate}
              className="flex min-h-11 items-center gap-2 rounded-sm border border-line px-2.5 text-sm text-ink transition-colors hover:bg-surface-2"
            >
              <l.icon
                aria-hidden="true"
                className="h-4 w-4 shrink-0 text-muted"
              />
              <span className="min-w-0 flex-1 wrap-anywhere">{l.label}</span>
              {l.count ? (
                <span className="rounded-pill bg-accent px-1.5 font-mono text-[11px] font-semibold leading-5 text-accent-contrast">
                  {unread?.capped ? `${l.count}+` : l.count}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
