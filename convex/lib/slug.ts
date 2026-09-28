// URL slug from a free-form label: no accents, lowercase, alphanumeric +
// hyphens, capped at ~72 characters. Pure -> testable.
// Shared by the document repository (F-32) and the member directory (F-19):
// uniqueness (-2, -3… suffix) is handled by the mutation on insert.
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
