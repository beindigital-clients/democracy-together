'use client';

import { useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { isMember } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { AuthGate, AuthGateLoading } from '@/components/auth/auth-gate';
import { Button } from '@/components/ui/button';
import {
  MemberPageBody,
  MemberPageHeader,
} from '@/components/member/page-header';

// PUBLIER UN TEXTE — one door for the three publishing circuits. The member
// says what they want to do, in their own words, and each choice says what
// happens next before sending them to the circuit's own form:
//   - a document (PDF)       → the library, checked by the team;
//   - a point of view        → the Tribune, read by the team;
//   - a manuscript           → the KOHOP Review, read by peers.
// Written for members who are not at ease with digital tools: one question,
// three large choices, no acronym in the choice titles.

type Choice = {
  id: string;
  title: string;
  body: string;
  next: string;
  cta: string;
  href: string;
  tone: string;
  // Set when this member cannot use the circuit yet: shown instead of the
  // button, so nobody is sent to a closed door.
  closedNote?: string;
};

function PublishChooser() {
  const t = useTranslations('member');
  const tl = useTranslations('library');
  const me = useQuery(api.users.current);
  const member = isMember(me?.role);
  // KOHOP deposits may be reserved to pilot organizations.
  const kohopAccess = useQuery(api.kohop.myAccess, member ? {} : 'skip');
  if (me === undefined) return <AuthGateLoading />;

  const choices: Choice[] = [
    {
      id: 'library',
      title: t('publishLibraryTitle'),
      body: t('publishLibraryBody'),
      next: t('publishLibraryNext'),
      cta: t('publishLibraryCta'),
      href: '/espace-membre/deposer',
      tone: 'border-line-strong',
    },
    {
      id: 'tribune',
      title: t('publishTribuneTitle'),
      body: t('publishTribuneBody'),
      next: t('publishTribuneNext'),
      cta: t('publishTribuneCta'),
      href: '/tribune',
      tone: 'border-line-strong',
    },
    {
      id: 'kohop',
      title: t('publishKohopTitle'),
      body: t('publishKohopBody'),
      next: t('publishKohopNext'),
      cta: t('publishKohopCta'),
      href: '/espace-membre/kohop',
      tone: 'border-accent-edge',
      closedNote:
        kohopAccess && !kohopAccess.canDeposit
          ? t('publishKohopPilot')
          : undefined,
    },
  ];

  return (
    <>
      <MemberPageHeader title={t('publishTitle')} lead={t('publishLead')} />
      <MemberPageBody>
        {!member ? (
          <div className="rounded-md border border-accent-edge bg-accent-tint p-6">
            <p className="max-w-[60ch] leading-relaxed text-ink-soft">
              {t('publishMembersOnly')}
            </p>
            <Button asChild className="mt-4 min-h-11">
              <Link href="/adhesion">{tl('submit.becomeMemberCta')}</Link>
            </Button>
          </div>
        ) : (
          <section aria-labelledby="publish-question">
            <h2
              id="publish-question"
              className="font-display text-2xl text-ink"
            >
              {t('publishQuestion')}
            </h2>
            <ul className="mt-5 grid gap-4 md:grid-cols-3">
              {choices.map((c) => (
                <li
                  key={c.id}
                  className={cn(
                    'flex flex-col gap-3 rounded-md border-2 bg-surface p-5',
                    c.tone,
                  )}
                >
                  <h3
                    id={`publish-${c.id}`}
                    className="font-display text-xl text-ink"
                  >
                    {c.title}
                  </h3>
                  <p className="text-[17px] leading-relaxed text-ink-soft">
                    {c.body}
                  </p>
                  <p className="border-t border-line pt-3 text-[15px] leading-relaxed text-ink">
                    {c.next}
                  </p>
                  {c.closedNote ? (
                    <p className="mt-auto rounded-md bg-surface-2 p-3 text-[15px] leading-relaxed text-ink-soft">
                      {c.closedNote}
                    </p>
                  ) : (
                    <Button
                      asChild
                      size="lg"
                      className="mt-auto min-h-12 self-start"
                    >
                      <Link href={c.href} aria-describedby={`publish-${c.id}`}>
                        {c.cta}
                      </Link>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </MemberPageBody>
    </>
  );
}

export default function PublishPage() {
  return (
    <AuthGate>
      <PublishChooser />
    </AuthGate>
  );
}
