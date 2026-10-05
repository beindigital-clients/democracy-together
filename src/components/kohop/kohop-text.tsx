import type { ReactNode } from 'react';
import { parseText, type Block, type Inline } from '@convex/lib/kohopText';
import { cn } from '@/lib/utils';

// Rendering of a KOHOP text: React ELEMENTS made from the parsed tree, never
// raw HTML — there is nothing to inject a script into. Links are external,
// opened in a new tab and marked `nofollow ugc` (plan § 4.8). A text with
// unsupported markup is still rendered (the editor shows the errors, the
// server refuses the submission): what is not understood shows as plain text.

function renderInline(nodes: readonly Inline[], key = ''): ReactNode[] {
  return nodes.map((node, i) => {
    const k = `${key}${i}`;
    switch (node.type) {
      case 'text':
        return node.text;
      case 'strong':
        return <strong key={k}>{renderInline(node.children, `${k}.`)}</strong>;
      case 'em':
        return <em key={k}>{renderInline(node.children, `${k}.`)}</em>;
      case 'link':
        return (
          <a
            key={k}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className="text-accent-text underline underline-offset-2 hover:no-underline"
          >
            {renderInline(node.children, `${k}.`)}
          </a>
        );
    }
  });
}

function renderBlock(block: Block, i: number): ReactNode {
  switch (block.type) {
    case 'heading': {
      const Tag = block.level === 2 ? 'h2' : 'h3';
      return (
        <Tag
          key={i}
          className={cn(
            'font-display font-medium text-ink',
            block.level === 2
              ? 'mt-8 text-2xl leading-snug'
              : 'mt-6 text-xl leading-snug',
          )}
        >
          {renderInline(block.children)}
        </Tag>
      );
    }
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Tag
          key={i}
          className={cn(
            'mt-4 space-y-1.5 ps-6',
            block.ordered ? 'list-decimal' : 'list-disc',
          )}
        >
          {block.items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </Tag>
      );
    }
    case 'quote':
      return (
        <blockquote
          key={i}
          className="mt-4 border-s-4 border-accent-edge ps-4 text-ink-soft italic"
        >
          {renderInline(block.children)}
        </blockquote>
      );
    default:
      return (
        <p key={i} className="mt-4 first:mt-0">
          {renderInline(block.children)}
        </p>
      );
  }
}

export function KohopText({
  markdown,
  lang,
  className,
}: {
  markdown: string;
  // Language the text is WRITTEN in (it may differ from the page's).
  lang?: string;
  className?: string;
}) {
  const { blocks } = parseText(markdown);
  return (
    <div
      lang={lang}
      className={cn(
        'max-w-[68ch] text-[17px] leading-[1.7] text-ink [&_h2:first-child]:mt-0',
        className,
      )}
    >
      {blocks.map(renderBlock)}
    </div>
  );
}
