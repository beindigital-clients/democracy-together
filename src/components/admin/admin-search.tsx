'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { SEARCH_MIN_LENGTH } from '@convex/lib/search';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';

// CHAMP DE RECHERCHE DES LISTES DU BACK-OFFICE (issue #49).
//
// La recherche est SERVEUR : ce composant ne filtre rien, il produit le terme
// que la liste passe en argument à sa query paginée. C'est la contrainte de
// l'issue, et ce n'est pas un détail d'implémentation — filtrer la page
// affichée ne chercherait que dans les 25 ou 50 lignes déjà chargées, alors
// que l'écran existe précisément pour retrouver celles qui n'y sont pas.
//
// Deux choses, donc, et deux seulement :
//
//  1. LA FRÉQUENCE. Une frappe = un argument de query = un abonnement Convex.
//     Sans temporisation, « diop » en ouvrirait quatre dont trois jetés
//     aussitôt. Le terme n'est remonté qu'une fois la saisie posée.
//  2. LE PLANCHER. En dessous du minimum serveur, le terme remonte VIDE plutôt
//     que tel quel : le serveur l'ignorerait de toute façon (lib/search.ts),
//     mais l'envoyer changerait les arguments — donc rouvrirait un abonnement —
//     pour exactement le même résultat. Le seuil est importé, pas recopié.
const DEBOUNCE_MS = 250;

// Terme effectivement applicable à la liste, à partir de la saisie brute.
function applicable(draft: string): string {
  const trimmed = draft.trim();
  return trimmed.length >= SEARCH_MIN_LENGTH ? trimmed : '';
}

export function AdminSearch({
  label,
  placeholder,
  value,
  onChange,
  className,
}: {
  label: string;
  placeholder?: string;
  // Terme actuellement appliqué à la liste (celui que la query reçoit).
  value: string;
  onChange: (term: string) => void;
  className?: string;
}) {
  const t = useTranslations('admin');
  const [draft, setDraft] = useState(value);
  // Dernier terme remonté. Sert à deux choses : ne pas réémettre une valeur
  // identique (un `onChange` de trop rouvre l'abonnement), et distinguer « le
  // parent a changé le terme de son côté » de « c'est notre propre émission
  // qui revient ».
  const emitted = useRef(value);
  // `onChange` est souvent une closure recréée à chaque rendu. La garder hors
  // des dépendances de l'effet de temporisation évite que n'importe quel rendu
  // du parent — une page de résultats qui arrive, par exemple — ne relance le
  // délai, et donc ne le repousse indéfiniment. La référence est mise à jour
  // APRÈS le rendu : y écrire pendant est interdit (react-hooks/refs).
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Remise à zéro venue du parent (autre filtre, changement d'écran) : la
  // saisie suit. Notre propre émission, elle, ne retouche pas le champ — sinon
  // le texte brut serait réécrit sous les doigts de la personne qui tape.
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    setDraft(value);
  }, [value]);

  useEffect(() => {
    const next = applicable(draft);
    if (next === emitted.current) return;
    const timer = setTimeout(() => {
      emitted.current = next;
      onChangeRef.current(next);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft]);

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <TextField
        // Un vrai `<label>` (masqué) plutôt qu'un `aria-label` posé à côté :
        // c'est le système de champs du dépôt (#41) qui porte le rattachement.
        // `type="search"` donne au champ son rôle accessible `searchbox`, donc
        // un nom qui ne dépend pas du seul `placeholder`.
        label={label}
        labelHidden
        type="search"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        className="min-w-0 flex-1 sm:max-w-sm"
        controlClassName="py-1.5 text-sm"
      />
      {draft ? (
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          onClick={() => setDraft('')}
        >
          {t('searchClear')}
        </Button>
      ) : null}
    </div>
  );
}
