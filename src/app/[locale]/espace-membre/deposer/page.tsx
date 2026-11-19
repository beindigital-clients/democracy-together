'use client';

import { AuthGate, AuthGateLoading } from '@/components/auth/auth-gate';
import { useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { isMember } from '@/lib/roles';
import { PublicationSubmitForm } from '@/components/library/publication-submit-form';
import { MemberPageHeader } from '@/components/member/page-header';

function DepositPage() {
  const t = useTranslations('library');
  const me = useQuery(api.users.current);
  if (me === undefined) return <AuthGateLoading />;
  const member = isMember(me?.role);
  return (
    <div className="max-w-3xl">
      <MemberPageHeader title={t('submit.title')} lead={t('submit.lead')} />
      {member ? (
        // This door feeds the library, not the peer review: point the author
        // who wants peers to read the text to KOHOP before they fill the form.
        <aside
          aria-labelledby="deposit-kohop-title"
          className="mt-6 rounded-md border border-accent-edge bg-accent-tint p-5"
        >
          <h2
            id="deposit-kohop-title"
            className="font-display text-lg text-ink"
          >
            {t('submit.kohopNoticeTitle')}
          </h2>
          <p className="mt-1 max-w-[62ch] leading-relaxed text-ink-soft">
            {t('submit.kohopNoticeBody')}
          </p>
          <Button asChild variant="outline" className="mt-3 min-h-11">
            <Link href="/espace-membre/kohop">
              {t('submit.kohopNoticeCta')}
            </Link>
          </Button>
        </aside>
      ) : null}
      <div className="mt-8">
        {member ? (
          <PublicationSubmitForm />
        ) : (
          <div className="rounded-md border border-accent-edge bg-accent-tint p-6">
            <p className="max-w-[60ch] leading-relaxed text-ink-soft">
              {t('submit.membersOnly')}
            </p>
            <Button asChild className="mt-4">
              <Link href="/adhesion">{t('submit.becomeMemberCta')}</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DeposerPage() {
  return (
    <AuthGate>
      <DepositPage />
    </AuthGate>
  );
}
