import type { ReactNode } from 'react';

// Layout racine distinct (route-group) pour le Studio Sanity : il rend son
// propre <html>, indépendamment de l'arbre localisé [locale]. Non indexé.
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
