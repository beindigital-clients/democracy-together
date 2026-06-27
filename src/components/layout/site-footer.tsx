import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Seal } from './seal';

export function SiteFooter() {
  const t = useTranslations('footer');
  const year = 2026;

  const columns = [
    { title: t('col1Title'), links: [['/a-propos', t('col1a')], ['/a-propos', t('col1b')], ['/a-propos', t('col1c')], ['/rapports', t('col1d')], ['/presse', t('col1e')]] },
    { title: t('col2Title'), links: [['/thematiques', t('col2d')], ['/analyses', t('col2a')], ['/barometre', t('col2b')], ['/tribune', t('col2e')], ['/experts', t('col2f')], ['/evenements', t('col2c')], ['/replays', t('col2g')]] },
    { title: t('col3Title'), links: [['/adhesion', t('col3a')], ['/appels-a-projets', t('col3e')], ['/espaces', t('col3f')], ['/don', t('col3b')], ['/newsletter', t('col3c')], ['/partenaires', t('col3d')]] },
  ] as const;

  return (
    <footer className="mt-auto border-t border-line bg-surface print:hidden">
      <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <div className="flex items-center gap-2.5">
              <Seal className="h-7 w-7 text-accent" />
              <span className="font-display text-lg font-medium">Democracy Together</span>
            </div>
            <p className="mt-3 max-w-[36ch] text-sm text-muted">{t('tagline')}</p>
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

        <div className="mt-10 flex flex-col gap-3 border-t border-line pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} {t('legalRights')}</p>
          <div className="flex flex-wrap gap-4">
            <Link href="/contact" className="hover:text-ink">{t('contact')}</Link>
            <Link href="/mentions-legales" className="hover:text-ink">{t('legalNotice')}</Link>
            <Link href="/confidentialite" className="hover:text-ink">{t('legalPrivacy')}</Link>
            <Link href="/accessibilite" className="hover:text-ink">{t('legalA11y')}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
