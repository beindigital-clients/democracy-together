import Image from 'next/image';
import type { Locale } from '@/i18n/routing';
import { direction } from '@/i18n/direction';

// RENDERING AN EXTRACTED DOCUMENT — typed blocks to printable HTML.
//
// Each block type has a shape and a BREAK RULE. That second point is what
// distinguishes a printable page from a page that happens to be printed:
// without `break-inside`, a table splits mid-row, a figure gets
// separated from its caption, and a subheading is left alone at the bottom of a page.
//
// The rules set here are the four that really matter:
//   - a subheading never ends a page (`break-after: avoid`);
//   - a figure, a table and a quote are never split;
//   - a paragraph leaves no single line at the bottom or at the top
//     (`orphans` / `widows`, which browsers apply when printing);
//   - the document title opens its page.
//
// They live in `globals.css` under `.dt-doc`, not as utility classes,
// because `orphans` and `widows` have no Tailwind utility and a
// document reads better with a stylesheet that can be reviewed in one piece.

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
    // Captioned image (RGAA 1.9): `role` and `aria-label` link the caption to
    // the image, as in `home-hero.tsx`.
    <figure
      role={block.caption ? 'figure' : undefined}
      aria-label={block.caption ?? undefined}
      className="dt-doc-figure my-7"
    >
      {url ? (
        // The image comes from the original PDF, copied without re-encoding. `alt` carries
        // the caption when there is one; otherwise it stays EMPTY rather than
        // describing "image" — an alternative that adds nothing is worth less than
        // no alternative, which a screen reader skips.
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
        // Non-extractable illustration (vector graphic, encoding not read by
        // `lib/pdfImages.ts`). We don't pretend: the spot is
        // marked, and the link to the original is just above the page.
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
  // The DOCUMENT title is an `h1` set by the page; subheadings
  // therefore start at `h2`, and a `level: 1` extracted from the PDF becomes `h2`.
  // Without this shift, the page would carry two `h1`s — which breaks a screen
  // reader's navigation outline, which relies on the hierarchy.
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
  /** Indexed like `imageIndex`; `null` = non-extractable image. */
  imageUrls: (string | null)[];
  contentLocale: Locale;
  pageLocale: Locale;
  /** Label shown in place of a non-extracted illustration. */
  figureFallback: string;
}) {
  // The document body carries ITS OWN language and writing direction, which are
  // not necessarily the interface's: a French-speaking reader may open the
  // Arabic version of a report. Without `dir`, the whole document would be laid out
  // left to right, punctuation included.
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
