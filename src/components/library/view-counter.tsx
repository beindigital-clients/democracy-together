'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useMutation } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { intlLocale } from '@/i18n/locale';

// Compteur de consultations (F-37).
//
// `ViewCounter` : au montage, si la session courante n'a pas encore vu cette
// publication, enregistre une consultation (mutation publique) et marque la
// clé en sessionStorage pour ne pas recompter au rechargement / à la
// navigation interne.
//
// AFFICHAGE EN RETARD D'UNE VUE (membre A-9, 27/09) : le nombre est rendu par
// le serveur AVANT que la vue courante soit enregistrée, donc chaque visiteur
// lisait un compteur qui n'incluait pas sa propre visite (4 220 → recharge →
// 4 221…). Le composant tient maintenant le nombre AFFICHÉ : `initial` (rendu
// serveur) + 1 dès que la vue courante est comptée. Une vue dédoublonnée
// (déjà comptée dans cette session) est déjà dans `initial`. `ViewsCount`
// lit ce nombre partout où la fiche l'affiche — en phrase (« 4 221 vues »)
// ou en chiffre (bloc « Mesure d'impact »).
const ViewsContext = createContext<number>(0);

export function ViewCounter({
  slug,
  initial,
  children,
}: {
  slug: string;
  initial: number;
  children: ReactNode;
}) {
  const record = useMutation(api.publications.recordPublicationView);
  const [count, setCount] = useState(initial);
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

    // Le +1 est optimiste : la mutation ne compte pas au-delà du quota, mais
    // pour CE lecteur sa visite a bien eu lieu.
    setCount((c) => c + 1);
    void record({ slug }).catch(() => {
      // L'enregistrement d'une vue ne doit jamais perturber la page.
    });
  }, [slug, record]);

  return (
    <ViewsContext.Provider value={count}>{children}</ViewsContext.Provider>
  );
}

// Nombre de consultations, tel que tenu par `ViewCounter`.
export function ViewsCount({ format }: { format: 'sentence' | 'number' }) {
  const count = useContext(ViewsContext);
  const t = useTranslations('library');
  const locale = useLocale();
  if (format === 'sentence') return <>{t('views', { count })}</>;
  return <>{count.toLocaleString(intlLocale(locale))}</>;
}
