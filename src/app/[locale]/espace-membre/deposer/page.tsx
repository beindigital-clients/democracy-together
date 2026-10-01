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
