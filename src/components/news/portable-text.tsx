import type { ReactNode } from 'react';
import { safeHref } from '@/lib/safe-href';

// Rendu du texte riche Sanity (actualités). EXTRAIT de la page : le filtre de
// liens ci-dessous est une défense, et une défense doit pouvoir être testée
// sur l'objet réellement passé à `<PortableText>` — pas sur une copie écrite
// dans le test, qui ne prouverait que sa propre cohérence.
// Cf. tests/unit/portable-text-liens.test.tsx.

// LIENS DU CMS (pentest M-9). `@portabletext/react` fournit un composant `link`
// par défaut qui rend `<a href={value.href}>` sans regarder le schéma — et,
// comme aucun `marks` n'était déclaré ici, c'est lui qui s'appliquait. Le
// schéma est désormais filtré (src/lib/safe-href.ts) :
//
//   schéma autorisé -> <a> avec `rel="noopener noreferrer"` ;
//   schéma refusé   -> <span> : le TEXTE de l'auteur reste lu, seule la
//                      navigation disparaît. Un `<a>` sans `href` serait un
//                      lien mort, cliquable et silencieux.
//
// `rel` n'est pas un détail de forme : ces liens sortent vers des domaines que
// le réseau ne contrôle pas, et `noopener` coupe l'accès à `window.opener`.
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
