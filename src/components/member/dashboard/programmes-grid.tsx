'use client';

import {
  ClipboardCheck,
  GraduationCap,
  Handshake,
  Rocket,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { isMember } from '@/lib/roles';
import { ArrowForward } from '@/components/ui/arrow';

type Programme = {
  key: string;
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
};

// The programmes (F-56 to F-60) as cards: a name, what one finds there, and
// the whole card as a single target. Calls for projects and evaluations are
// offered to approved members only — the server refuses them to others.
export function ProgrammesGrid({ role }: { role: string }) {
  const t = useTranslations('member');
  const all: (Programme & { memberOnly?: boolean })[] = [
    {
      key: 'youth',
      href: '/espace-membre/jeunes',
      icon: Sparkles,
      title: t('navYouth'),
      description: t('progYouthDesc'),
    },
    {
      key: 'mentoring',
      href: '/espace-membre/mentorat',
      icon: Handshake,
      title: t('navMentoring'),
      description: t('progMentoringDesc'),
    },
    {
      key: 'learning',
      href: '/espace-membre/parcours',
      icon: GraduationCap,
      title: t('navLearning'),
      description: t('progLearningDesc'),
    },
    {
      key: 'projects',
      href: '/espace-membre/projets',
      icon: Rocket,
      title: t('navProjects'),
      description: t('progProjectsDesc'),
      memberOnly: true,
    },
    {
      key: 'evaluations',
      href: '/espace-membre/evaluations',
      icon: ClipboardCheck,
      title: t('navEvaluations'),
      description: t('progEvaluationsDesc'),
      memberOnly: true,
    },
  ];
  const programmes = all.filter((p) => !p.memberOnly || isMember(role));
  return (
    <section aria-labelledby="dash-programmes-title">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2
            id="dash-programmes-title"
            className="font-display text-[24px] leading-tight text-ink"
          >
            {t('programmesTitle')}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">{t('programmesLead')}</p>
        </div>
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        {programmes.map((p) => (
          <li key={p.key}>
            <Link
              href={p.href}
              className="group flex h-full items-start gap-4 rounded-md border border-line bg-surface p-4 shadow-card transition-colors hover:border-accent-edge hover:bg-accent-tint"
            >
              <span
                aria-hidden="true"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-sm bg-accent-tint text-accent-text transition-colors group-hover:bg-accent group-hover:text-accent-contrast"
              >
                <p.icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2 font-medium text-ink">
                  <span className="wrap-anywhere">{p.title}</span>
                  <ArrowForward />
                </span>
                <span className="mt-1 block text-sm leading-snug text-ink-soft">
                  {p.description}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
