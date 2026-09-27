import Image from 'next/image';
import type { Locale } from '@/i18n/routing';
import { direction } from '@/i18n/direction';

// RENDU D'UN DOCUMENT EXTRAIT — blocs typés vers HTML imprimable.
//
// Chaque type de bloc a une forme et une RÈGLE DE COUPURE. C'est ce second
// point qui distingue une page imprimable d'une page qu'on imprime : sans
// `break-inside`, un tableau se coupe au milieu d'une ligne, une figure se
// sépare de sa légende, et un intertitre reste seul en bas de page.
//
// Les règles posées ici sont les quatre qui comptent vraiment :
//   - un intertitre ne finit jamais une page (`break-after: avoid`) ;
//   - une figure, un tableau et une citation ne se coupent pas ;
//   - un paragraphe ne laisse ni ligne seule en bas ni ligne seule en haut
//     (`orphans` / `widows`, que les navigateurs appliquent à l'impression) ;
//   - le titre du document ouvre sa page.
//
// Elles vivent dans `globals.css` sous `.dt-doc`, et non en classes utilitaires,
// parce que `orphans` et `widows` n'ont pas d'utilitaire Tailwind et qu'un
// document se lit mieux avec une feuille de style qui se relit d'un bloc.

export type DocBlock = {
  type: 'heading' | 'paragraph' | 'list' | 'quote' | 'table' | 'figure';
  level?: number;
  text?: string;
  items?: string[];
  rows?: string[][];
  imageIndex?: number;
  caption?: string;
};

function Figure({
  block,
  url,
  fallbackLabel,
}: {
  block: DocBlock;
  url: string | null;
  fallbackLabel: string;
}) {
  return (
    // Image légendée (RGAA 1.9) : `role` et `aria-label` relient la légende à
    // l'image, comme dans `home-hero.tsx`.
    <figure
      role={block.caption ? 'figure' : undefined}
      aria-label={block.caption ?? undefined}
      className="dt-doc-figure my-7"
    >
      {url ? (
        // L'image vient du PDF d'origine, recopiée sans ré-encodage. `alt` porte
        // la légende quand il y en a une ; à défaut il reste VIDE plutôt que de
        // décrire « image » — une alternative qui n'apporte rien vaut moins que
        // pas d'alternative, qu'un lecteur d'écran saute.
        <span className="relative block overflow-hidden rounded-sm border border-line bg-surface-2">
          <Image
            src={url}
            alt={block.caption ?? ''}
            width={1200}
            height={800}
            unoptimized
            className="h-auto w-full"
          />
        </span>
      ) : (
        // Illustration non extractible (graphique vectoriel, codage non lu par
        // `lib/pdfImages.ts`). On ne fait pas semblant : l'emplacement est
        // marqué, et le renvoi vers l'original est juste au-dessus de la page.
        <span className="flex min-h-[90px] items-center justify-center rounded-sm border border-dashed border-line-strong bg-surface-2 px-4 py-6 text-center text-[13px] text-muted">
          {fallbackLabel}
        </span>
      )}
      {block.caption ? (
        <figcaption className="mt-2 text-[12.5px] leading-snug text-muted">
          {block.caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

function Table({ block }: { block: DocBlock }) {
  const rows = block.rows ?? [];
  if (rows.length === 0) return null;
  const [header, ...body] = rows;
  return (
    <figure className="dt-doc-table my-7">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr>
              {header.map((cell, i) => (
                <th
                  key={`${cell}-${i}`}
                  scope="col"
                  className="border border-line bg-surface-2 px-3 py-2 text-start font-medium text-ink"
                >
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td
                    key={`${r}-${c}`}
                    className="border border-line px-3 py-2 align-top text-ink-soft"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {block.caption ? (
        <figcaption className="mt-2 text-[12.5px] leading-snug text-muted">
          {block.caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

function Heading({ block }: { block: DocBlock }) {
  // Le titre du DOCUMENT est un `h1` posé par la page ; les intertitres
  // commencent donc à `h2`, et un `level: 1` extrait du PDF devient `h2`.
  // Sans ce décalage, la page porterait deux `h1` — ce qui casse le plan de
  // navigation d'un lecteur d'écran, qui s'appuie sur la hiérarchie.
  const level = Math.min(4, Math.max(1, block.level ?? 2));
  const sizes = [
    'text-[22px] mt-10',
    'text-[19px] mt-8',
    'text-[17px] mt-7',
    'text-[15px] mt-6',
  ];
  const className = `dt-doc-heading font-display font-medium leading-snug text-ink ${sizes[level - 1]}`;
  const Tag = (['h2', 'h3', 'h4', 'h5'] as const)[level - 1];
  return <Tag className={className}>{block.text}</Tag>;
}

export function DocumentBlocks({
  blocks,
  imageUrls,
  contentLocale,
  pageLocale,
  figureFallback,
}: {
  blocks: DocBlock[];
  /** Indexé comme `imageIndex` ; `null` = image non extractible. */
  imageUrls: (string | null)[];
  contentLocale: Locale;
  pageLocale: Locale;
  /** Libellé affiché à la place d'une illustration non extraite. */
  figureFallback: string;
}) {
  // Le corps du document porte SA langue et SON sens d'écriture, qui ne sont
  // pas forcément ceux de l'interface : un lecteur francophone peut ouvrir la
  // version arabe d'un rapport. Sans `dir`, tout le document se composerait de
  // gauche à droite, ponctuation comprise.
  const attrs =
    contentLocale === pageLocale
      ? {}
      : { lang: contentLocale, dir: direction(contentLocale) };

  return (
    <div {...attrs} className="dt-doc">
      {blocks.map((block, i) => {
        const key = `${block.type}-${i}`;
        switch (block.type) {
          case 'heading':
            return <Heading key={key} block={block} />;
          case 'list':
            return (
              <ul key={key} className="dt-doc-list my-4 flex flex-col gap-1.5">
                {(block.items ?? []).map((item, j) => (
                  <li
                    key={`${key}-${j}`}
                    className="relative ps-5 text-[15px] leading-relaxed text-ink-soft before:absolute before:start-0 before:top-[0.62em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-accent"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            );
          case 'quote':
            return (
              <blockquote
                key={key}
                className="dt-doc-quote my-6 border-s-2 border-accent-edge ps-4 font-display text-[17px] leading-relaxed text-ink"
              >
                {block.text}
              </blockquote>
            );
          case 'table':
            return <Table key={key} block={block} />;
          case 'figure':
            return (
              <Figure
                key={key}
                block={block}
                url={
                  block.imageIndex !== undefined
                    ? (imageUrls[block.imageIndex] ?? null)
                    : null
                }
                fallbackLabel={figureFallback}
              />
            );
          default:
            return (
              <p
                key={key}
                className="dt-doc-p my-4 text-[15px] leading-[1.75] text-ink-soft"
              >
                {block.text}
              </p>
            );
        }
      })}
    </div>
  );
}
