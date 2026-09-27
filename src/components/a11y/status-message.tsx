'use client';

import { useEffect, useRef, type ReactNode } from 'react';

// MESSAGE DE CONFIRMATION QUI REMPLACE UN FORMULAIRE (RGAA 7.5 et 12.8).
//
// Motif mesuré à l'audit RGAA du 27/09 sur dix formulaires (contact, adhésion,
// lettre d'information, inscription et rappel d'événement, hub jeunes,
// mentorat, appel à projets, dépôt de publication, mot de passe) : à l'envoi
// réussi, le formulaire est remplacé par un `role="status"` créé EN MÊME
// TEMPS que son texte. Deux défauts en découlent :
//
//  1. le bouton d'envoi, qui avait le focus, disparaît du DOM — le focus
//     retombe sur `<body>`, et la tabulation suivante repart du haut de la
//     page ;
//  2. une région live insérée avec son contenu n'est pas annoncée de façon
//     fiable (NVDA et JAWS l'annoncent souvent sous Chrome, VoiceOver
//     rarement) : la personne ne sait pas si l'envoi a réussi.
//
// Porter le FOCUS sur le message règle les deux d'un coup : il est lu parce
// qu'il est focalisé, quel que soit le lecteur d'écran, et la navigation
// reprend là où était le formulaire. `tabIndex={-1}` : focalisable par script,
// hors de la séquence de tabulation. `role="status"` est conservé pour les
// aides techniques qui suivent les régions live sans suivre le focus.
//
// Monté UNIQUEMENT à la réussite (c'est l'appelant qui décide de le rendre) :
// l'effet ne s'exécute qu'à l'apparition, jamais au chargement de la page.
export function StatusMessage({
  as: Tag = 'div',
  className,
  children,
}: {
  as?: 'div' | 'p' | 'span';
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement & HTMLParagraphElement & HTMLSpanElement>(
    null,
  );
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <Tag ref={ref} role="status" tabIndex={-1} className={className}>
      {children}
    </Tag>
  );
}
