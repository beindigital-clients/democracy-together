'use client';

import { useEffect, useRef } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';

// Compteur de consultations (F-37) — îlot client invisible. Au montage, si la
// session courante n'a pas encore vu cette publication, enregistre une
// consultation (mutation publique) et marque la clé en sessionStorage pour ne
// pas recompter au rechargement / à la navigation interne. N'affiche rien : le
// décompte affiché est rendu côté serveur depuis `pub.views`.
export function ViewCounter({ slug }: { slug: string }) {
  const record = useMutation(api.publications.recordPublicationView);
  // Garde StrictMode (double montage en dev) et changements de slug.
  const done = useRef<string | null>(null);

  useEffect(() => {
    if (!slug || done.current === slug) return;
    done.current = slug;

    const key = `dtviewed:${slug}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // sessionStorage indisponible (mode privé strict, SSR) : on enregistre
      // quand même la vue, sans dédoublonnage de session.
    }

    void record({ slug }).catch(() => {
      // L'enregistrement d'une vue ne doit jamais perturber la page.
    });
  }, [slug, record]);

  return null;
}
