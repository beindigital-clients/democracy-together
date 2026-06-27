import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

// Placeholder « bientôt disponible » pour les routes du réseau pas encore
// construites (évite tout 404 dans la nav / le footer). Le titre de section est
// résolu par la page appelante.
export async function ComingSoon({ title }: { title: string }) {
  const t = await getTranslations('comingSoon');
  return (
    <div className="mx-auto max-w-[760px] px-4 py-20 text-center sm:px-6 md:py-28">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
        {t('eyebrow')}
      </p>
      <h1 className="mt-3 font-display text-[clamp(30px,4vw,46px)] font-medium leading-[1.08] tracking-[-0.02em]">
        {title}
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-ink-soft">{t('body')}</p>
      <Button asChild variant="outline" className="mt-8">
        <Link href="/">{t('back')}</Link>
      </Button>
    </div>
  );
}
