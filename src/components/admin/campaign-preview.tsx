import { useTranslations } from 'next-intl';

// CAMPAIGN PREVIEW (27/09 campaign, R-07). The editor was sending
// blind: no rendering of the subject or body before "Envoyer". This component
// renders the text the way `campaignHtml` (convex/newsletter.ts) will format
// it: one paragraph per blank line, a line break kept within the
// paragraph, and the unsubscribe footer every send carries. It does NOT
// render HTML: the body is plain text, and is displayed as such.
//
// PURE component — subject and body come in as props — so it can be tested
// without a browser (tests/unit/admin-campaign-preview.test.tsx).

export function splitParagraphs(body: string): string[][] {
  return body
    .trim()
    .split(/\n{2,}/)
    .filter((p) => p.trim().length > 0)
    .map((p) => p.split('\n'));
}

export function CampaignPreview({
  subject,
  body,
}: {
  subject: string;
  body: string;
}) {
  const t = useTranslations('admin');
  const paragraphs = splitParagraphs(body);
  const empty = subject.trim().length === 0 && paragraphs.length === 0;

  return (
    <section
      aria-label={t('nlPreviewTitle')}
      className="rounded-md border border-line bg-surface-2 p-4"
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
        {t('nlPreviewTitle')}
      </p>
      {empty ? (
        <p className="mt-2 text-sm text-ink-soft">{t('nlPreviewEmpty')}</p>
      ) : (
        <div className="mt-3 rounded-sm border border-line bg-surface p-4">
          <p className="text-sm text-ink-soft">
            {t('nlPreviewSubject')}{' '}
            <span className="wrap-anywhere font-medium text-ink">
              {subject.trim()}
            </span>
          </p>
          <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-ink">
            {paragraphs.map((lines, i) => (
              <p key={i} className="wrap-anywhere">
                {lines.map((line, j) => (
                  <span key={j}>
                    {j > 0 ? <br /> : null}
                    {line}
                  </span>
                ))}
              </p>
            ))}
          </div>
          <p className="mt-5 border-t border-line pt-3 text-xs text-muted">
            {t('nlPreviewFooter')}
          </p>
        </div>
      )}
    </section>
  );
}
