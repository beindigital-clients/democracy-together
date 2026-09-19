import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { PublicPublication } from '@convex/lib/publications';
import { formatMonthYear } from '@/lib/publications';

// La carte ne reçoit que ce que les queries publiques servent — pas le
// document complet (issue #30).
type Pub = PublicPublication;

function langsLabel(languages: string[]): string {
  return languages.map((l) => l.toUpperCase()).join(' / ');
}

// Couverture de repli pour les dépôts membres sans vignette (F-32) : un aplat
// discret portant le type de document, plutôt qu'une image cassée.
function CoverFallback({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[linear-gradient(135deg,var(--color-surface-2),var(--color-paper))]">
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
        {label}
      </span>
    </div>
  );
}

// Carte publication (F-32). Variante `compact` pour le bloc « liées » du détail
// (image + méta + titre seulement). Image décorative (alt vide) : le titre
// adjacent porte le lien. Vignette lazy + optimisée (next/image).
export async function PublicationCard({
  pub,
  locale,
  variant = 'full',
}: {
  pub: Pub;
  locale: string;
  variant?: 'full' | 'compact';
}) {
  const t = await getTranslations('library');
  const date = formatMonthYear(pub.publishedAt, locale);
  const meta = `${t(`types.${pub.type}`)} · ${date}${
    variant === 'full' ? ` · ${langsLabel(pub.languages)}` : ''
  }`;

  if (variant === 'compact') {
    return (
      <Link
        href={`/bibliotheque/${pub.slug}`}
        className="group flex flex-col overflow-hidden rounded-sm border border-line bg-surface transition-all hover:-translate-y-0.5 hover:shadow-md"
      >
        <div className="relative aspect-[16/10] bg-surface-2">
          {pub.image ? (
            <Image
              src={pub.image}
              alt=""
              fill
              sizes="(max-width: 880px) 100vw, 33vw"
              className="object-cover"
            />
          ) : (
            <CoverFallback label={t(`types.${pub.type}`)} />
          )}
        </div>
        <div className="p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
            {meta}
          </p>
          <h3 className="mt-1.5 font-display text-[17px] font-medium leading-snug">
            {pub.title}
          </h3>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/bibliotheque/${pub.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-sm border border-line bg-surface shadow-sm transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md"
    >
      <div className="relative aspect-[16/10] bg-surface-2">
        {pub.image ? (
          <Image
            src={pub.image}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1080px) 50vw, 33vw"
            className="object-cover"
          />
        ) : (
          <CoverFallback label={t(`types.${pub.type}`)} />
        )}
      </div>
      <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
          {meta}
        </p>
        <h3 className="mb-2 mt-1.5 font-display text-[19px] font-medium leading-tight">
          {pub.title}
        </h3>
        <p className="text-[13px] text-ink-soft">
          {pub.authors.map((a) => a.name).join(', ')}
        </p>
        <div className="mt-3">
          <span className="inline-flex items-center rounded-pill border border-accent-edge bg-accent-tint px-2.5 py-1 text-xs font-medium text-accent-text">
            {t(`themes.${pub.theme}`)}
          </span>
        </div>
        <div className="mt-auto flex items-center gap-2.5 pt-4">
          <span
            className={`rounded-pill border px-2 py-[3px] font-mono text-[10px] uppercase tracking-[0.06em] ${
              pub.access === 'open'
                ? 'border-[color-mix(in_srgb,var(--color-bar-1)_40%,transparent)] text-bar-1'
                : 'border-accent-edge bg-accent-tint text-accent-text'
            }`}
          >
            {t(`accessShort.${pub.access}`)}
          </span>
          <span
            className="inline-flex items-center gap-1 font-mono text-[11px] text-muted"
            title={t('downloads')}
          >
            ↓ {pub.downloads.toLocaleString(locale)}
          </span>
          <span
            className="inline-flex items-center gap-1 font-mono text-[11px] text-muted"
            title={t('citations')}
          >
            ❝ {pub.citations}
          </span>
          <span className="ml-auto truncate font-mono text-[10.5px] text-muted">
            {pub.doi}
          </span>
        </div>
      </div>
    </Link>
  );
}
