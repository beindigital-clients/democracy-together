'use client';

import type { ReactNode } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';

// Lien de téléchargement / consultation d'une publication (F-34).
//
// Un simple `<a>` : le document (ou la notice DOI) s'ouvre dans un nouvel
// onglet, avec ou sans JavaScript. Le clic enregistre EN PLUS un
// téléchargement (mutation publique, sous quota — cf. convex/publications.ts
// `recordPublicationDownload`) : mesuré le 27/09 (membre A-8), le compteur
// « Télécharg. » n'était jamais incrémenté, aucune mutation ne l'écrivait.
// L'enregistrement est lancé sans être attendu : la navigation part tout de
// suite, et un échec (quota, backend muet) n'empêche jamais d'ouvrir le lien.
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
          // Un téléchargement non compté ne doit jamais perturber la page.
        });
      }}
    >
      {children}
    </a>
  );
}
