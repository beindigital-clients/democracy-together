import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { ContentTabs } from '@/components/admin/contenus/content-tabs';

// SELF-SERVICE CONTENT MANAGEMENT (F-62) — shared shell of the seven screens.
// The "éditeur" rank is enforced by the back-office navigation
// (`admin-nav.tsx`, "Édition" group) and, above all, by each Convex
// function called (`requireEditor`): this shell authorizes nothing.
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
