// Validation partagée — côté client (Next). L'équivalent serveur vit dans
// convex/lib/validation.ts (la frontière Convex/Next interdit un module unique :
// garder les deux synchrones).
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

// Lecture d'un champ texte de formulaire. `FormData.get` rend
// `string | File | null` : `String()` dessus produit silencieusement
// « [object File] » sur un champ fichier et « null » sur un champ absent.
// Tous les formulaires du site n'ont que des champs texte — ramener le cas
// non-texte à la chaîne vide est le comportement attendu partout.
export function formField(fd: FormData, name: string): string {
  const value = fd.get(name);
  return typeof value === 'string' ? value : '';
}
