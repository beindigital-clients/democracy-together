import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

// Page title for the publication submission (RGAA 8.6) — see
// `espace-membre/layout.tsx` for the finding and the reason for the layout.
// The screen's name only: the member-area template adds the area and the
// site after it.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'library' });
  return {
    title: t('submit.title'),
  };
}

export default function DeposerLayout({ children }: { children: ReactNode }) {
  return children;
}
