'use client';

import { useConvexAuth } from 'convex/react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

// Bouton « Rejoindre » (→ demande d'adhésion). Masqué lorsque l'utilisateur est
// déjà connecté : un membre n'a plus à « rejoindre » — le changement de statut se
// gère dans son espace personnel.
export function JoinButton({
  className,
  onClick,
}: {
  className?: string;
  onClick?: () => void;
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const t = useTranslations('nav');
  if (isLoading || isAuthenticated) return null;
  return (
    <Button asChild className={className} onClick={onClick}>
      <Link href="/adhesion">{t('join')}</Link>
    </Button>
  );
}
