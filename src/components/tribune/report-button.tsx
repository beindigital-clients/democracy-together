'use client';

import { useState } from 'react';
import { useConvexAuth, useMutation } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';

// Signalement (F-50) — tout compte authentifié peut signaler un post/commentaire.
// Déconnecté : lien vers la connexion.
export function ReportButton({
  targetType,
  targetId,
}: {
  targetType: 'post' | 'comment';
  targetId: string;
}) {
  const t = useTranslations('tribune');
  const { isAuthenticated } = useConvexAuth();
  const report = useMutation(api.tribune.reportContent);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  if (done) {
    return <span className="text-[12px] text-muted">{t('reported')}</span>;
  }
  if (!isAuthenticated) {
    return (
      <Link
        href="/connexion"
        className="text-[12px] text-muted hover:text-ink hover:underline"
      >
        {t('report')}
      </Link>
    );
  }

  async function onClick() {
    setPending(true);
    try {
      await report({ targetType, targetId });
      setDone(true);
    } catch {
      /* rate-limit éventuel : silencieux */
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="text-[12px] text-muted hover:text-ink hover:underline"
    >
      {t('report')}
    </button>
  );
}
