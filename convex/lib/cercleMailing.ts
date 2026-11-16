import { isEmail, isReservedEmail } from './validation';
import { normalizeEmail } from './onboarding';
import { SITE_LOCALES, type SiteLocale } from './locales';

// CERCLE DES AMIS — MAILING LIST: pure rules shared by convex/cercleMailing.ts,
// the campaign engine (convex/newsletter.ts) and the tests.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// --- Confirmation of an IMPORTED contact -----------------------------------------
//
// An imported contact asked for nothing. They receive ONE message — the
// confirmation request — and have 30 days to click. Without a click the row is
// deleted. Same deadline as the newsletter's legacy migration, for the same
// reason: the person has to be able to find the message and think about it.
export const CERCLE_CONFIRM_TTL_MS = 30 * DAY;

// A failure to SEND (provider down, mailbox full) is retried, but never beyond
// this many sends in all: the list is not a way to write to someone over and
// over. No reminder is ever sent to a contact who simply did not answer.
export const CERCLE_CONFIRM_MAX_SENDS = 3;

// Version of the information shown in the confirmation message and at the
// request form, stored with the proof of consent.
export const CERCLE_MAILING_TEXT_VERSION = '2026-11-draft';

// --- Sender identity -----------------------------------------------------------------
//
// Every message must say WHO writes and WHERE they are (name and postal
// address of the association). The real values are awaited from the client:
// until then they are PLACEHOLDERS, clearly marked, and sending to real
// recipients is REFUSED while one is left (see `senderIdentity`). The values
// are Convex environment variables, never code:
//   npx convex env set CERCLE_SENDER_NAME "…"
//   npx convex env set CERCLE_SENDER_ADDRESS "…"
export const SENDER_PLACEHOLDER_MARK = '[À CONFIRMER';
const NAME_PLACEHOLDER = `${SENDER_PLACEHOLDER_MARK} : nom de l’association]`;
const ADDRESS_PLACEHOLDER = `${SENDER_PLACEHOLDER_MARK} : adresse postale de l’association]`;

export type SenderIdentity = {
  name: string;
  address: string;
  /** True while the name or the address is still a placeholder. */
  placeholder: boolean;
};

function envText(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  return raw ? raw : undefined;
}

export function senderIdentity(): SenderIdentity {
  const name = envText('CERCLE_SENDER_NAME') ?? NAME_PLACEHOLDER;
  const address = envText('CERCLE_SENDER_ADDRESS') ?? ADDRESS_PLACEHOLDER;
  return {
    name,
    address,
    placeholder:
      name.includes(SENDER_PLACEHOLDER_MARK) ||
      address.includes(SENDER_PLACEHOLDER_MARK),
  };
}

// --- CSV import ------------------------------------------------------------------------
//
// One call takes a bounded number of rows (a Convex mutation has limits, and a
// reviewer reads the report). A bigger file is cut in several imports.
export const IMPORT_MAX_ROWS = 500;
export const IMPORT_BATCH_LABEL_MAX = 80;

export type ParsedContact = {
  email: string;
  locale?: SiteLocale;
  line: number;
};

export type ParsedContacts = {
  contacts: ParsedContact[];
  invalid: { line: number; reason: 'INVALID_EMAIL' | 'EMPTY' }[];
  duplicatesInFile: number;
  /** Rows beyond `IMPORT_MAX_ROWS`: not read, to be imported separately. */
  truncated: number;
};

const EMAIL_HEADERS = ['email', 'e-mail', 'mail', 'courriel', 'adresse'];
const LOCALE_HEADERS = ['langue', 'lang', 'locale', 'language', 'idioma'];

function splitLine(line: string, separator: string): string[] {
  const out: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        cell += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === separator) {
      out.push(cell);
      cell = '';
    } else {
      cell += c;
    }
  }
  out.push(cell);
  return out.map((x) => x.trim());
}

function detectSeparator(header: string): string {
  const counts = [',', ';', '\t'].map(
    (sep) => [sep, header.split(sep).length] as const,
  );
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Reads a contact file: one address per line, or a table with a header
 * (`email`, optionally `langue`). Separators `,` `;` and tab are recognised, an
 * Excel BOM is ignored. Pure: no database, no clock.
 */
export function parseContactsCsv(text: string): ParsedContacts {
  const lines = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
    .split(/\r\n|\n|\r/)
    .map((raw, i) => ({ raw, line: i + 1 }))
    .filter((l) => l.raw.trim() !== '');
  const result: ParsedContacts = {
    contacts: [],
    invalid: [],
    duplicatesInFile: 0,
    truncated: 0,
  };
  if (lines.length === 0) return result;

  const separator = detectSeparator(lines[0].raw);
  const firstCells = splitLine(lines[0].raw, separator).map((c) =>
    c.toLowerCase(),
  );
  const hasHeader =
    firstCells.some((c) => EMAIL_HEADERS.includes(c)) &&
    !lines[0].raw.includes('@');
  let emailCol = 0;
  let localeCol = -1;
  if (hasHeader) {
    emailCol = firstCells.findIndex((c) => EMAIL_HEADERS.includes(c));
    localeCol = firstCells.findIndex((c) => LOCALE_HEADERS.includes(c));
  }

  const seen = new Set<string>();
  const rows = hasHeader ? lines.slice(1) : lines;
  for (const { raw, line } of rows) {
    if (result.contacts.length + result.invalid.length >= IMPORT_MAX_ROWS) {
      result.truncated++;
      continue;
    }
    const cells = splitLine(raw, separator);
    const candidate = cells[emailCol] ?? '';
    if (!candidate) {
      result.invalid.push({ line, reason: 'EMPTY' });
      continue;
    }
    const email = normalizeEmail(candidate);
    if (!isEmail(email)) {
      result.invalid.push({ line, reason: 'INVALID_EMAIL' });
      continue;
    }
    if (seen.has(email)) {
      result.duplicatesInFile++;
      continue;
    }
    seen.add(email);
    const wanted = localeCol >= 0 ? (cells[localeCol] ?? '').toLowerCase() : '';
    const locale = (SITE_LOCALES as readonly string[]).includes(wanted)
      ? (wanted as SiteLocale)
      : undefined;
    result.contacts.push({ email, ...(locale ? { locale } : {}), line });
  }
  return result;
}

/** Test and reserved domains never receive a real message. */
export function isMailable(email: string): boolean {
  return !isReservedEmail(email);
}

// --- Who still has to be asked --------------------------------------------------------
//
// A pending contact is asked when no confirmation was ever sent, or when the
// last attempt FAILED to send and the bound has not been reached (`toAsk`, kept
// by the waves). A contact whose message went out and who did not answer is NOT
// asked again.
export function needsConfirmationSend(contact: {
  status: string;
  confirmSends: number;
  toAsk?: boolean;
}): boolean {
  return (
    contact.status === 'pending' &&
    contact.toAsk === true &&
    contact.confirmSends < CERCLE_CONFIRM_MAX_SENDS
  );
}
