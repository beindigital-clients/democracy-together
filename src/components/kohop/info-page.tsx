import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Reveal } from '@/components/motion/reveal';

const WRAP = 'mx-auto w-full max-w-[1180px] px-4 sm:px-6';

// A page of KOHOP's reading material (charter, guides): a title, a clear
// "first draft, to be validated" banner — the texts are the client's to write
// (D-11) — and numbered sections. Server component: nothing is sent to the
// browser but the HTML.
export async function KohopInfoPage({
  title,
  lead,
  items,
}: {
  title: string;
  lead: string;
  items: { title: string; body: string }[];
}) {
  const t = await getTranslations('kohopPublic');
  return (
    <div>
      <div className={`${WRAP} pt-8`}>
        <p className="text-[13px] text-muted">
          <Link href="/" className="text-muted hover:text-ink">
            {t('breadcrumbHome')}
          </Link>{' '}
          /{' '}
          <Link href="/kohop" className="text-muted hover:text-ink">
            KOHOP
          </Link>
        </p>
      </div>
      <header className="border-b border-line">
        <div className={`${WRAP} pb-10 pt-6`}>
          <Reveal>
            <h1 className="max-w-[24ch] font-display text-[clamp(30px,4.2vw,48px)] font-medium leading-[1.08] tracking-[-0.015em]">
              {title}
            </h1>
            <p className="mt-4 max-w-[68ch] text-lg text-ink-soft">{lead}</p>
          </Reveal>
        </div>
      </header>
      <div className={`${WRAP} pb-24 pt-8`}>
        <p
          role="note"
          className="max-w-[68ch] rounded-md border border-accent-edge bg-accent-tint p-4 text-sm text-ink"
        >
          {t('draftBanner')}
        </p>
        <ol className="mt-8 max-w-[68ch] space-y-8">
          {items.map((item) => (
            <li key={item.title}>
              <h2 className="font-display text-2xl text-ink">{item.title}</h2>
              <p className="mt-2 text-ink-soft">{item.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-12">
          <Link
            href="/kohop"
            className="text-sm font-medium text-accent-text hover:underline"
          >
            ← {t('backToList')}
          </Link>
        </p>
      </div>
    </div>
  );
}
