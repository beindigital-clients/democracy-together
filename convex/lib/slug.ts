// Slug URL à partir d'un libellé libre : sans accents, minuscules,
// alphanumérique + tirets, borné à ~72 caractères. Pur -> testable.
// Partagé par le dépôt documentaire (F-32) et l'annuaire des membres (F-19) :
// l'unicité (suffixe -2, -3…) est gérée par la mutation à l'insertion.
export function slugify(title: string): string {
  const base = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
    .replace(/-+$/g, '');
  return base || 'publication';
}
