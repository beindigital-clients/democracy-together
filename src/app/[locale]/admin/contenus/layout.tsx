import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { ContentTabs } from '@/components/admin/contenus/content-tabs';

// GESTION AUTONOME DES CONTENUS (F-62) — coquille commune des six écrans.
// Le rang « éditeur » est posé par la navigation du back-office
// (`admin-nav.tsx`, groupe « Édition ») et, surtout, par chaque fonction
// Convex appelée (`requireEditor`) : cette coquille n'autorise rien.
export default async function ContenusLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getTranslations('contentAdmin');
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
        {t('title')}
      </p>
      <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-ink-soft">
        {t('lead')}
      </p>
      <ContentTabs />
      <div className="mt-6">{children}</div>
    </div>
  );
}
