// Replays de webinaires (F-54) — page LEAN dérivée des événements PASSÉS.
// AUCUNE fausse vidéo : on ne fait que lister les événements `upcoming:false`
// (avec leur `durationMin`), triés par date DÉCROISSANTE, et on affiche un
// encart honnête « Enregistrement bientôt disponible ». Les libellés (titres,
// types, villes) viennent de `getEventsLabels(locale)` — pas de duplication.

import { EVENTS, getEventsLabels, whenOf } from './events-content';

export type Replay = {
  slug: string;
  title: string;
  type: string;
  durationMin?: number;
  y: number;
  mo: number;
  d: number;
};

// Liste des événements passés (`upcoming === false`), du plus récent au plus
// ancien (date décroissante), avec libellés localisés prêts à afficher.
export function getReplays(locale: 'fr' | 'en'): Replay[] {
  const labels = getEventsLabels(locale);
  return EVENTS.filter((e) => e.upcoming === false)
    .slice()
    .sort((a, b) => whenOf(b) - whenOf(a))
    .map((e) => ({
      slug: e.slug,
      title: labels.titles[e.slug],
      type: labels.types[e.type],
      durationMin: e.durationMin,
      y: e.y,
      mo: e.mo,
      d: e.d,
    }));
}
