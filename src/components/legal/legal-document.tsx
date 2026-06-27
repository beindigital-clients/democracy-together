import { Link } from '@/i18n/navigation';
import { Reveal } from '@/components/motion/reveal';
import type { LegalDoc } from '@/lib/legal-content';

// Rendu d'une page légale (F-09) : en-tête + sections, colonne de lecture
// étroite et typographie éditoriale. Server component, animé sobrement (Reveal).
export function LegalDocument({ doc }: { doc: LegalDoc }) {
  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-12 sm:px-6 sm:py-16">
      <p className="text-[13px] text-muted">
        <Link href="/" className="text-muted hover:text-ink">
          {doc.homeLabel}
        </Link>{' '}
        / {doc.title}
      </p>

      <Reveal className="mt-4">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
          {doc.eyebrow}
        </p>
        <h1 className="mt-3 font-display text-[clamp(30px,4.4vw,44px)] font-medium leading-tight tracking-[-0.015em]">
          {doc.title}
        </h1>
        <p className="mt-3 font-mono text-[12px] text-muted">
          {doc.updatedLabel} · {doc.updated}
        </p>
        <p className="mt-6 max-w-[64ch] text-lg leading-relaxed text-ink-soft">
          {doc.intro}
        </p>
      </Reveal>

      <div className="mt-10 flex flex-col gap-9">
        {doc.sections.map((s) => (
          <Reveal as="section" key={s.heading}>
            <h2 className="font-display text-[22px] font-medium tracking-[-0.01em]">
              {s.heading}
            </h2>
            <div className="mt-3 flex flex-col gap-3">
              {s.body.map((p) => (
                <p
                  key={p.slice(0, 40)}
                  className="max-w-[68ch] leading-relaxed text-ink-soft"
                >
                  {p}
                </p>
              ))}
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
