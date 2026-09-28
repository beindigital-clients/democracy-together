'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { ArrowForward } from '@/components/ui/arrow';

// Access to the programmes from the member area (F-56 to F-60). Calls for
// projects and evaluations are reserved for approved members (the server
// enforces it): the entry is only offered to them.
export function ProgrammeMemberLinks({ member }: { member: boolean }) {
  const ty = useTranslations('youth');
  const tm = useTranslations('mentorship');
  const tp = useTranslations('projects');
  const tt = useTranslations('toolbox');
  const links: [string, string][] = [
    ['/espace-membre/jeunes', ty('memberLink')],
    ['/espace-membre/mentorat', tm('memberLink')],
    ['/espace-membre/parcours', tt('memberLink')],
    ...(member
      ? ([
          ['/espace-membre/projets', tp('memberLink')],
          ['/espace-membre/evaluations', tp('evaluationsLink')],
        ] as [string, string][])
      : []),
  ];
  return (
    <section className="mt-8" aria-labelledby="programmes-links-h">
      <h2 id="programmes-links-h" className="font-display text-xl">
        {tt('memberProgrammesTitle')}
      </h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link
              href={href}
              className="flex min-h-11 items-center justify-between gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-ink hover:border-accent-edge hover:bg-accent-tint"
            >
              {label}
              <ArrowForward />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
