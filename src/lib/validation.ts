// Shared validation — client side (Next). The server equivalent lives in
// convex/lib/validation.ts (the Convex/Next boundary rules out a single module:
// keep the two in sync).
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

// Reads a form text field. `FormData.get` returns
// `string | File | null`: calling `String()` on it silently produces
// "[object File]" on a file field and "null" on a missing field.
// All the site's forms only have text fields — reducing the non-text case
// to the empty string is the expected behavior everywhere.
export function formField(fd: FormData, name: string): string {
  const value = fd.get(name);
  return typeof value === 'string' ? value : '';
}
