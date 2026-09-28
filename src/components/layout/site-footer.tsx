import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { CopyrightYear } from './copyright-year';
import { Logo } from './logo';
import { ThemeToggle } from './theme-toggle';

export function SiteFooter() {
  const t = useTranslations('footer');
  // SERVER component (no 'use client' here nor in the layout that mounts it):
  // the year is that of the RENDER, no longer a constant to re-edit every
  // January (issue #36). `CopyrightYear` reuses it as is on the first client
  // render — hence without hydration mismatch — and only corrects it after
  // mount, for the day these pages are served from HTML frozen at
  // build time (issue #13).
  const year = new Date().getFullYear();

  const columns = [
    {
      title: t('col1Title'),
      links: [
        // Three labels, three destinations (issue #46): these entries
        // all pointed to bare `/a-propos`, hence to the top of the page, leaving
        // the visitor to find the section — on an element present on
        // every page, and a long page on mobile. The anchors (and the
        // focus that follows them) are set in `a-propos/page.tsx`.
        ['/a-propos#vision', t('col1a')],
        ['/a-propos#gouvernance', t('col1b')],
        ['/a-propos#fondateurs', t('col1c')],
        ['/rapports', t('col1d')],
        ['/presse', t('col1e')],
      ],
    },
    {
      title: t('col2Title'),
      links: [
        ['/thematiques', t('col2d')],
        ['/analyses', t('col2a')],
        ['/barometre', t('col2b')],
        ['/tribune', t('col2e')],
        ['/experts', t('col2f')],
        ['/evenements', t('col2c')],
        ['/replays', t('col2g')],
      ],
    },
    {
      title: t('col3Title'),
      links: [
        ['/adhesion', t('col3a')],
        ['/appels-a-projets', t('col3e')],
        ['/espaces', t('col3f')],
        ['/don', t('col3b')],
        ['/newsletter', t('col3c')],
        ['/partenaires', t('col3d')],
      ],
    },
  ] as const;

  return (
    <footer className="mt-auto border-t border-line bg-surface print:hidden">
      <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Logo />
            <p className="mt-3 max-w-[36ch] text-sm text-muted">
              {t('tagline')}
            </p>
          </div>

          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h2 className="font-mono text-xs uppercase tracking-[0.12em] text-muted">
                {col.title}
              </h2>
              <ul className="mt-3 space-y-2">
                {col.links.map(([href, label]) => (
                  <li key={label}>
                    <Link
                      href={href}
                      className="text-sm text-ink-soft transition-colors hover:text-ink"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-line pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            © <CopyrightYear serverYear={year} /> {t('legalRights')}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link href="/contact" className="hover:text-ink">
              {t('contact')}
            </Link>
            <Link href="/mentions-legales" className="hover:text-ink">
              {t('legalNotice')}
            </Link>
            <Link href="/confidentialite" className="hover:text-ink">
              {t('legalPrivacy')}
            </Link>
            <Link href="/accessibilite" className="hover:text-ink">
              {t('legalA11y')}
            </Link>
            {/* Theme toggle: moved here from the desktop bar (space);
                also remains in the mobile menu. */}
            <span className="inline-flex items-center gap-1.5">
              <span>{t('theme')}</span>
              <ThemeToggle />
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
