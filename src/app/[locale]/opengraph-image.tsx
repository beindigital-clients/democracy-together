import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';
import { resolveLocale } from '@/i18n/locale';
import { isRtl } from '@/i18n/direction';
import { SITE_NAME } from '@/lib/seo';

// Share image (F-03), GENERATED rather than versioned.
//
// The repo has already paid the cost of binaries: issue #19 established that
// `design/` (38 MB) alone accounted for ~95% of `.git`. An image produced at
// render time weighs nothing in the history, and follows the site's text when
// it changes — a frozen PNG would say "Réseau international…" long after the
// description has moved on.
//
// Placed under `[locale]`, it applies to ALL pages of the segment: Next
// sets `og:image`, its dimensions and its type on each one, without the page
// having to deal with it.

// Both texts come from the messages file, not from a locale ternary:
// the guardrail from issue #34 refuses a visible sentence being
// chosen by `loc === 'fr' ? … : …`, and rightly so — one more language
// and the ternary lies.
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = SITE_NAME;

export default async function OpenGraphImage({
  params,
}: {
  params: { locale: string };
}) {
  const loc = resolveLocale(params.locale);
  const t = await getTranslations({ locale: loc, namespace: 'site' });

  // SATORI DOES NOT READ `globals.css`, and that is the whole point of these
  // two lines.
  //
  // The site's RTL fix lives in the stylesheet — `[lang='ar'] h1..h4
  // { letter-spacing: normal }` and the `dir` set on `<html>`. This image is
  // composed by Satori, which has neither: it is the ONLY Arabic surface
  // of the product that the fix does not cover, and it is public on every
  // link share.
  //
  // `letterSpacing` on Arabic detaches the letters of a single word — Arabic
  // is a cursive script, and "أفريقيا · أوروبا" came out broken apart. The
  // missing direction, for its part, sent the final full stop and the "·"
  // separator to the wrong side of the sentence.
  const rtl = isRtl(loc);

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: '#0d1b2a',
        padding: '72px 80px',
        fontFamily: 'sans-serif',
        direction: rtl ? 'rtl' : 'ltr',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            background: '#f58b1a',
          }}
        />
        <div
          style={{
            color: '#f58b1a',
            fontSize: 26,
            // Letter spacing is a Latin typographic breathing space; on a
            // cursive script, it breaks the joins between letters.
            letterSpacing: rtl ? 0 : 4,
            // `uppercase` is harmless: Arabic has no letter case.
            textTransform: 'uppercase',
          }}
        >
          {t('regions')}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div
          style={{
            color: '#ffffff',
            fontSize: 88,
            lineHeight: 1.05,
            letterSpacing: -2,
          }}
        >
          {SITE_NAME}
        </div>
        <div
          style={{
            color: '#c7d3de',
            fontSize: 34,
            lineHeight: 1.35,
            maxWidth: 900,
          }}
        >
          {t('description')}
        </div>
      </div>

      <div style={{ display: 'flex', height: 8, width: 220 }}>
        <div style={{ flex: 1, background: '#f58b1a' }} />
      </div>
    </div>,
    size,
  );
}
