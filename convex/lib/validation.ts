// Validation partagée — côté Convex (serveur). L'équivalent client vit dans
// src/lib/validation.ts (la frontière Convex/Next interdit un module unique :
// garder les deux synchrones).
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}
