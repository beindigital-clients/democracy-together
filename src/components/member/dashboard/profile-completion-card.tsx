'use client';

import { useQuery } from 'convex/react';
import { CircleCheck, Circle, UserRoundPen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import {
  COMPLETION_ANCHORS,
  profileCompletion,
  type Completion,
  type CompletionStep,
} from '@/lib/profile-completion';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ArrowForward } from '@/components/ui/arrow';
import { DashCard } from './dash-card';

function useStepLabels(): Record<CompletionStep, string> {
  const t = useTranslations('member');
  return {
    profile: t('completionItemProfile'),
    photo: t('completionItemPhoto'),
    jobTitle: t('completionItemJob'),
    bio: t('completionItemBio'),
    country: t('completionItemCountry'),
    themes: t('completionItemThemes'),
    languages: t('completionItemLanguages'),
    links: t('completionItemLinks'),
    visibility: t('completionItemVisibility'),
  };
}

// "Complete your profile" block: a meter and the steps left, each a link to
// the editor section where it is done. Hidden once everything is done — a
// block that congratulates forever is noise.
export function CompletionView({ completion }: { completion: Completion }) {
  const t = useTranslations('member');
  const labels = useStepLabels();
  if (completion.complete) return null;
  const left = completion.total - completion.done;
  return (
    <DashCard
      titleId="dash-completion-title"
      title={t('completionTitle')}
      icon={UserRoundPen}
      lead={t('completionLead')}
    >
      <ProgressBar
        label={t('completionProgressLabel')}
        percent={completion.percent}
        text={t('completionProgress', { percent: completion.percent })}
      />
      <p className="mt-2 text-xs text-muted">
        {t('completionStepsLeft', { count: left })}
      </p>
      {/* Only what is LEFT to do is listed, each step a link to where it is
          done: a list that repeats the finished steps buries the one that
          matters under the ones that no longer do. */}
      <ul className="-mx-2 mt-3 grid gap-1 sm:grid-cols-2">
        {completion.steps
          .filter((step) => !step.done)
          .map((step) => (
            <li key={step.key}>
              <Link
                href={`/espace-membre/profil#${COMPLETION_ANCHORS[step.key]}`}
                className="group flex min-h-10 items-center gap-2.5 rounded-sm px-2 text-sm font-medium text-ink transition-colors hover:bg-accent-tint hover:text-accent-text"
              >
                <Circle
                  aria-hidden="true"
                  className="h-[18px] w-[18px] shrink-0 text-line-strong group-hover:text-accent-text"
                />
                <span className="min-w-0 flex-1">{labels[step.key]}</span>
                <ArrowForward />
              </Link>
            </li>
          ))}
      </ul>
      <p className="mt-3 flex items-center gap-2 text-xs text-muted">
        <CircleCheck aria-hidden="true" className="h-4 w-4 text-bar-1" />
        {t('completionDoneCount', {
          done: completion.done,
          total: completion.total,
        })}
      </p>
    </DashCard>
  );
}

export function ProfileCompletionCard() {
  const profile = useQuery(api.social.profiles.getMine);
  if (!profile) return null;
  return <CompletionView completion={profileCompletion(profile)} />;
}
