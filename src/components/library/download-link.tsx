'use client';

import type { ReactNode } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';

// Download / view link for a publication (F-34).
//
// A plain `<a>`: the document (or the DOI record) opens in a new
// tab, with or without JavaScript. The click ALSO records a
// download (public mutation, under quota — see convex/publications.ts
// `recordPublicationDownload`): measured on 27/09 (member A-8), the
// "Télécharg." counter was never incremented, no mutation wrote it.
// The recording is fired without being awaited: navigation starts right
// away, and a failure (quota, silent backend) never prevents opening the link.
export function DownloadLink({
  slug,
  href,
  className,
  children,
}: {
  slug: string;
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const record = useMutation(api.publications.recordPublicationDownload);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => {
        void record({ slug }).catch(() => {
          // An uncounted download must never disrupt the page.
        });
      }}
    >
      {children}
    </a>
  );
}
