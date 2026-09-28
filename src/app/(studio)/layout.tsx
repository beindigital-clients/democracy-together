import type { ReactNode } from 'react';

// Separate root layout (route group) for the Sanity Studio: it renders its
// own <html>, independently of the localized [locale] tree. Not indexed.
export const metadata = {
  title: 'Democracy Together · Studio',
  robots: { index: false, follow: false },
};

export default function StudioRootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
