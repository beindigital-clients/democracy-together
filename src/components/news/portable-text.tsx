import type { ReactNode } from 'react';
import { safeHref } from '@/lib/safe-href';

// Renders Sanity rich text (news). EXTRACTED from the page: the link filter
// below is a defence, and a defence must be testable
// on the object actually passed to `<PortableText>` — not on a copy written
// in the test, which would only prove its own consistency.
// See tests/unit/portable-text-liens.test.tsx.

// CMS LINKS (pentest M-9). `@portabletext/react` provides a default `link`
// component that renders `<a href={value.href}>` without looking at the scheme — and,
// since no `marks` were declared here, that is the one that applied. The
// scheme is now filtered (src/lib/safe-href.ts):
//
//   allowed scheme  -> <a> with `rel="noopener noreferrer"`;
//   rejected scheme -> <span>: the author's TEXT is still read, only the
//                      navigation disappears. An `<a>` without `href` would be a
//                      dead link, clickable and silent.
//
// `rel` is not a cosmetic detail: these links go out to domains that
// the network does not control, and `noopener` cuts access to `window.opener`.
export const ptComponents = {
  block: {
    normal: ({ children }: { children?: ReactNode }) => (
      <p className="mt-4 max-w-[68ch] leading-relaxed text-ink-soft">
        {children}
      </p>
    ),
    h2: ({ children }: { children?: ReactNode }) => (
      <h2 className="mt-8 font-display text-2xl">{children}</h2>
    ),
  },
  marks: {
    link: ({
      children,
      value,
    }: {
      children?: ReactNode;
      value?: { href?: string };
    }) => {
      const href = safeHref(value?.href);
      if (!href) return <span>{children}</span>;
      return (
        <a
          href={href}
          rel="noopener noreferrer"
          className="text-accent-text underline underline-offset-2"
        >
          {children}
        </a>
      );
    },
  },
};
