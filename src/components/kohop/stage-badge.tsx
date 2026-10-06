'use client';

import { useTranslations } from 'next-intl';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { vocabulary } from '@/i18n/vocabulary';

// The stage of a contribution, as a labelled pill: the colour never says it
// alone (RGAA 3.1), the text always does.
const VARIANT: Record<string, BadgeVariant> = {
  draft: 'default',
  submitted: 'pending',
  returned: 'pending',
  in_review: 'accent',
  revision: 'accent',
  decision: 'pending',
  production: 'accent',
  proof: 'accent',
  ready: 'good',
  scheduled: 'good',
  published: 'good',
  refused: 'bad',
  withdrawn: 'default',
  retracted: 'bad',
};

export function StageBadge({ stage }: { stage: string }) {
  const t = useTranslations('kohop');
  return (
    <Badge variant={VARIANT[stage] ?? 'default'} size="label">
      {vocabulary(t, 'stage_', stage)}
    </Badge>
  );
}
