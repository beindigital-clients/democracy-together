import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';
import { resolveLocale } from '@/i18n/locale';
import { SITE_NAME } from '@/lib/seo';

// Image de partage (F-03), GÉNÉRÉE plutôt que versionnée.
//
// Le dépôt a déjà payé le coût des binaires : l'issue #19 a établi que
// `design/` (38 Mo) pesait à lui seul ~95 % du `.git`. Une image produite au
// rendu ne pèse rien dans l'historique, et suit le texte du site quand il
// change — une PNG figée dirait « Réseau international… » longtemps après que
// la description a bougé.
//
// Placée sous `[locale]`, elle vaut pour TOUTES les pages du segment : Next
// pose `og:image`, ses dimensions et son type sur chacune, sans que la page
// ait à s'en occuper.

// Les deux textes viennent du fichier de messages, pas d'un ternaire de
// locale : le garde-fou de l'issue #34 refuse qu'une phrase visible soit
// choisie par `loc === 'fr' ? … : …`, et il a raison — une langue de plus
// et le ternaire ment.
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
            letterSpacing: 4,
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
