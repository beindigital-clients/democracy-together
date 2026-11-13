// CERCLE DES AMIS — pure rules shared by convex/cercle*.ts and the tests.

import { isEmail, FIELD_MAX } from './validation';
import { normalizeEmail } from './onboarding';
import type { ReviewMachine } from './reviewState';

// --- Versions of what the person agreed to ------------------------------------
//
// The charter and the information notice are texts (messages/*.json,
// namespace `cercle`). Their VERSION is stored with each request, as the
// newsletter does for its notice (`CONSENT_TEXT_VERSION`): if the wording
// changes, we know which wording each person accepted.
//
// TO CONFIRM with the client: the final charter text. The versions carry a
// `draft` suffix until then, so a request recorded under the placeholder
// wording can be told apart later.
export const CERCLE_CHARTER_VERSION = '2026-11-draft';
// The notice covers (1) what is done with the CV, (2) the news the person
// receives by e-mail once they have joined.
export const CERCLE_NOTICE_VERSION = '2026-11-draft';

// --- CV ----------------------------------------------------------------------
//
// A SHORT CV, in PDF only: the president reads it on a screen, nothing else is
// needed, and a single accepted format keeps the content check simple (the
// bytes must start with `%PDF-`, see lib/fileCheck.ts).
export const CV_MAX_BYTES = 5 * 1024 * 1024;
export const CV_CONTENT_TYPE = 'application/pdf';
export const CV_FILE_NAME_MAX = 200;

// --- Free text -----------------------------------------------------------------
export const MOTIVATION_MAX = 1500;
export const NAME_MIN = 2;

export type RequestInput = {
  name: string;
  email: string;
  country?: string;
  motivation?: string;
};

export type RequestValidation =
  | {
      ok: true;
      value: {
        name: string;
        email: string;
        country?: string;
        motivation?: string;
      };
    }
  | {
      ok: false;
      code:
        | 'INVALID_NAME'
        | 'INVALID_EMAIL'
        | 'INVALID_COUNTRY'
        | 'INVALID_MOTIVATION';
    };

/** Trims and bounds the text fields of a request. Pure. */
export function validateRequestInput(input: RequestInput): RequestValidation {
  const name = input.name.trim();
  if (name.length < NAME_MIN || name.length > FIELD_MAX.name) {
    return { ok: false, code: 'INVALID_NAME' };
  }
  const email = normalizeEmail(input.email);
  if (!isEmail(email)) return { ok: false, code: 'INVALID_EMAIL' };
  const country = input.country?.trim() || undefined;
  if (country !== undefined && country.length > FIELD_MAX.country) {
    return { ok: false, code: 'INVALID_COUNTRY' };
  }
  const motivation = input.motivation?.trim() || undefined;
  if (motivation !== undefined && motivation.length > MOTIVATION_MAX) {
    return { ok: false, code: 'INVALID_MOTIVATION' };
  }
  return { ok: true, value: { name, email, country, motivation } };
}

/** Is a stored blob acceptable as a CV? Pure verdict on its metadata. */
export function cvMetadataVerdict(
  meta: { size: number; contentType?: string } | null,
): 'ok' | 'INVALID_FILE' {
  if (!meta || meta.size <= 0 || meta.size > CV_MAX_BYTES) {
    return 'INVALID_FILE';
  }
  // The announced type is the uploader's word; the BYTES are checked by the
  // action (signature `%PDF-`). A type that is set and is not PDF is refused
  // here already.
  if (meta.contentType && meta.contentType !== CV_CONTENT_TYPE) {
    return 'INVALID_FILE';
  }
  return 'ok';
}

// State machine of a request: one decision, final. A refused request is not
// "reopened": the person can ask again, which creates a NEW request (the old
// one carried a CV that was deleted at refusal).
export const CERCLE_REQUEST_REVIEW: ReviewMachine<
  'pending' | 'approved' | 'rejected'
> = {
  transitions: { pending: ['approved', 'rejected'] },
  decided: ['approved', 'rejected'],
};
