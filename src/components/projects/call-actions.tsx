'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { callWindowState } from '@convex/lib/programmes';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { isMember } from '@/lib/roles';
import {
  CallStatePill,
  CallWindowLine,
  type PublicCall,
} from '@/components/projects/calls-list';

// Island on a call's page: window status in the visitor's time, and
// access to submission — reserved for members, and only during the window.
export function CallActions({ call }: { call: PublicCall }) {
  const t = useTranslations('projects');
  const me = useQuery(api.users.current);
  const [now] = useState(() => Date.now());
  const open = callWindowState(call, now) === 'open';
  return (
    <div className="rounded-md border border-line bg-surface p-5">
      <CallStatePill call={call} now={now} />
      <div className="mt-2">
        <CallWindowLine call={call} now={now} />
      </div>
      {open ? (
        me === undefined ? null : isMember(me?.role) ? (
          <Button asChild className="mt-4 min-h-11">
            <Link href={`/espace-membre/projets/${call.slug}`}>
              {t('applyCta')}
            </Link>
          </Button>
        ) : (
          <div className="mt-4">
            <p className="text-[14px] text-ink-soft">{t('gateBody')}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button asChild className="min-h-11">
                <Link href="/adhesion">{t('gateJoin')}</Link>
              </Button>
              {me === null ? (
                <Button asChild variant="outline" className="min-h-11">
                  <Link href="/connexion">{t('gateSignIn')}</Link>
                </Button>
              ) : null}
            </div>
          </div>
        )
      ) : null}
    </div>
  );
}
