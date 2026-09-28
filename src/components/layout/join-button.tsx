'use client';

import { useConvexAuth } from 'convex/react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// "Rejoindre" button (→ membership application). Hidden when the user is
// already signed in: a member no longer needs to "join" — status changes are
// handled in their personal area.
//
// THIS COMPONENT IS THE ROOT CAUSE OF F-13. Rendering `null` while Convex
// responded made 94 px pop up in a right-anchored cluster (`ms-auto`,
// site-header.tsx:41): the language switcher jumped 104 px TO THE LEFT
// after the first render, and a tap aimed at "EN" landed on the container.
// Measured: on click, the actual target was a `div`, never the button.
//
// `connecteAuRendu` comes from the SERVER (`isAuthenticatedNextjs()`). When it
// is provided, the FINAL variant is rendered in the served HTML: an anonymous
// visitor sees the button right away, a signed-in visitor sees nothing at all
// — and neither suffers any shift.
//
// Without it (legacy call), we fall back to `invisible`: the box is kept,
// hence the exact width in every language, without having to guess it, and
// the element leaves the keyboard path and the accessibility tree.
export function JoinButton({
  className,
  onClick,
  connecteAuRendu,
}: {
  className?: string;
  onClick?: () => void;
  connecteAuRendu?: boolean;
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const t = useTranslations('nav');

  const connecte = isLoading ? connecteAuRendu : isAuthenticated;
  if (connecte === true) return null;

  const enAttente = connecte === undefined;
  return (
    <Button asChild className={cn(className, enAttente && 'invisible')}>
      <Link
        href="/adhesion"
        onClick={onClick}
        aria-hidden={enAttente || undefined}
        tabIndex={enAttente ? -1 : undefined}
      >
        {t('join')}
      </Link>
    </Button>
  );
}
