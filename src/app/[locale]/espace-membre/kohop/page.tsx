'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { KOHOP_LANGS } from '@convex/lib/kohop';
import { AuthGateLoading } from '@/components/auth/auth-gate';
import { MemberPageHeader } from '@/components/member/page-header';
import { Link, useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/field';
import { SelectField } from '@/components/ui/choice-fields';
import { isMember } from '@/lib/roles';
import { vocabulary } from '@/i18n/vocabulary';
import { StageBadge } from '@/components/kohop/stage-badge';
import { useKohopDates, useKohopError } from '@/components/kohop/use-kohop';

function NewContribution() {
  const t = useTranslations('kohop');
  const router = useRouter();
  const create = useMutation(api.kohop.createDraft);
  const errorMessage = useKohopError();
  const [lang, setLang] = useState<string>('fr');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function start() {
    setBusy(true);
    setError('');
    try {
      const id = await create({ lang: lang === 'en' ? 'en' : 'fr' });
      router.push(`/espace-membre/kohop/${id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="kohop-new"
      className="mt-8 rounded-md border border-line bg-surface p-5 sm:p-6"
    >
      <h2 id="kohop-new" className="font-display text-xl text-ink">
        {t('newTitle')}
      </h2>
      <p className="mt-1 max-w-[62ch] text-sm text-ink-soft">{t('newLead')}</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <SelectField
          label={t('langLabel')}
          value={lang}
          onValueChange={setLang}
          options={KOHOP_LANGS.map((l) => ({
            value: l,
            label: vocabulary(t, 'lang_', l),
          }))}
        />
        <Button type="button" onClick={start} disabled={busy}>
          {busy ? t('creating') : t('newContribution')}
        </Button>
      </div>
      <FormError className="mt-2">{error}</FormError>
    </section>
  );
}

export default function KohopAuthorHome() {
  const t = useTranslations('kohop');
  const dates = useKohopDates();
  const me = useQuery(api.users.current);
  const member = isMember(me?.role);
  const access = useQuery(api.kohop.myAccess, member ? {} : 'skip');
  const mine = useQuery(api.kohop.listMine, member ? {} : 'skip');
  if (me === undefined) return <AuthGateLoading />;

  return (
    <div className="max-w-3xl">
      <MemberPageHeader title={t('authorTitle')} lead={t('authorLead')} />

      {!member ? (
        <p className="mt-8 rounded-md border border-accent-edge bg-accent-tint p-6 text-ink-soft">
          {t('membersOnly')}
        </p>
      ) : access === undefined || mine === undefined ? (
        <p className="mt-8 text-ink-soft" role="status">
          {t('loading')}
        </p>
      ) : (
        <>
          {access.canDeposit ? (
            <NewContribution />
          ) : (
            <section
              aria-labelledby="kohop-pilot"
              className="mt-8 rounded-md border border-accent-edge bg-accent-tint p-6"
            >
              <h2 id="kohop-pilot" className="font-display text-xl text-ink">
                {t('pilotOnlyTitle')}
              </h2>
              <p className="mt-2 max-w-[62ch] text-ink-soft">
                {t('pilotOnlyBody')}
              </p>
            </section>
          )}

          <section aria-labelledby="kohop-mine" className="mt-10">
            <h2 id="kohop-mine" className="font-display text-2xl">
              {t('myContributions')}
            </h2>
            {mine.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">
                {t('noContributions')}
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {mine.map((c) => {
                  const due =
                    c.revisionDueAt ?? c.proofDueAt ?? c.returnedDueAt;
                  return (
                    <li key={c._id}>
                      <Link
                        href={`/espace-membre/kohop/${c._id}`}
                        className="block rounded-md border border-line bg-surface p-4 transition-colors hover:border-ink"
                      >
                        <span className="flex flex-wrap items-start justify-between gap-3">
                          <span className="min-w-0 wrap-anywhere font-display text-lg text-ink">
                            {c.title || t('untitled')}
                          </span>
                          <StageBadge stage={c.stage} />
                        </span>
                        <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
                          <span>
                            {t('updatedOn', { date: dates.day(c.updatedAt) })}
                          </span>
                          {due ? (
                            <span>{t('dueOn', { date: dates.day(due) })}</span>
                          ) : null}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
