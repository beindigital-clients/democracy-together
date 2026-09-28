// CONTENT VERIFICATION of a shared file (collaborative workspaces, F-24).
//
// Three sources of information about a file, and only one is reliable:
//   - the NAME (and its extension): chosen by the uploader;
//   - the TYPE announced on upload (the blob's `contentType`): chosen by the
//     uploader's browser, hence by them;
//   - the BYTES: what the file actually is.
// An executable renamed `rapport.pdf` and sent with `application/pdf` passes
// the first two checks. Hence the rule: a file is accepted only if
// its first bytes carry the SIGNATURE of the format its extension
// announces. The check is pure (bytes in, a verdict out):
// it is tested without storage, and the action calling it has nothing to decide.

export type FileKind = {
  // Extensions accepted for this format (lowercase, without the dot).
  extensions: readonly string[];
  // Type served on download — that of the recognized FORMAT, never the one
  // announced by the uploader.
  contentType: string;
  // Byte verification.
  check: (bytes: Uint8Array) => boolean;
};

function startsWith(bytes: Uint8Array, sig: readonly number[], at = 0) {
  if (bytes.length < at + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[at + i] !== sig[i]) return false;
  }
  return true;
}

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

const PDF = ascii('%PDF-');
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const RIFF = ascii('RIFF');
const WEBP = ascii('WEBP');
// ZIP container: open office formats (OOXML, OpenDocument) are
// ZIPs. The signature does not distinguish a .docx from any .zip; we
// additionally look, in the header, for the entry name specific to the format.
const ZIP = [0x50, 0x4b, 0x03, 0x04];

function containsAscii(bytes: Uint8Array, needle: string, limit = 4096) {
  const n = ascii(needle);
  const end = Math.min(bytes.length, limit) - n.length;
  for (let i = 0; i <= end; i++) {
    if (startsWith(bytes, n, i)) return true;
  }
  return false;
}

// Text: VALID UTF-8 and no null byte. An arbitrary binary fails on
// one or the other almost always; legitimate text always passes.
//
// Validation written by hand rather than `TextDecoder({ fatal: true })`: the
// Convex runtime is not a browser, and a silently ignored option
// would let any binary pass for text.
function isUtf8Text(bytes: Uint8Array): boolean {
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b === 0) return false;
    let extra: number;
    if (b < 0x80) extra = 0;
    else if (b >= 0xc2 && b <= 0xdf) extra = 1;
    else if (b >= 0xe0 && b <= 0xef) extra = 2;
    else if (b >= 0xf0 && b <= 0xf4) extra = 3;
    else return false;
    // Truncated sequence at end of file: `c` is undefined, rejected.
    for (let k = 1; k <= extra; k++) {
      const c = bytes[i + k];
      if (c === undefined || (c & 0xc0) !== 0x80) return false;
    }
    i += extra + 1;
  }
  return true;
}

const OOXML = (bytes: Uint8Array) =>
  startsWith(bytes, ZIP) && containsAscii(bytes, '[Content_Types].xml');
// An OpenDocument starts with the uncompressed `mimetype` entry, which carries
// the type: it is the format's convention, and it makes the check exact.
const odf = (mime: string) => (bytes: Uint8Array) =>
  startsWith(bytes, ZIP) && containsAscii(bytes, `mimetype${mime}`, 256);

export const FILE_KINDS: readonly FileKind[] = [
  {
    extensions: ['pdf'],
    contentType: 'application/pdf',
    check: (b) => startsWith(b, PDF),
  },
  {
    extensions: ['png'],
    contentType: 'image/png',
    check: (b) => startsWith(b, PNG),
  },
  {
    extensions: ['jpg', 'jpeg'],
    contentType: 'image/jpeg',
    check: (b) => startsWith(b, JPEG),
  },
  {
    extensions: ['webp'],
    contentType: 'image/webp',
    check: (b) => startsWith(b, RIFF) && startsWith(b, WEBP, 8),
  },
  {
    extensions: ['docx'],
    contentType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    check: OOXML,
  },
  {
    extensions: ['xlsx'],
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    check: OOXML,
  },
  {
    extensions: ['pptx'],
    contentType:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    check: OOXML,
  },
  {
    extensions: ['odt'],
    contentType: 'application/vnd.oasis.opendocument.text',
    check: odf('application/vnd.oasis.opendocument.text'),
  },
  {
    extensions: ['ods'],
    contentType: 'application/vnd.oasis.opendocument.spreadsheet',
    check: odf('application/vnd.oasis.opendocument.spreadsheet'),
  },
  {
    extensions: ['txt'],
    contentType: 'text/plain; charset=utf-8',
    check: isUtf8Text,
  },
  {
    extensions: ['md'],
    contentType: 'text/markdown; charset=utf-8',
    check: isUtf8Text,
  },
  {
    extensions: ['csv'],
    contentType: 'text/csv; charset=utf-8',
    check: isUtf8Text,
  },
];

// List displayed in the form (`accept` attribute) — derived, never
// copied.
export const ACCEPTED_EXTENSIONS: readonly string[] = FILE_KINDS.flatMap(
  (k) => k.extensions,
);

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

// Displayed file name: no path, no control characters, bounded.
// The name is user data rendered in the interface and offered for
// download: a "../" or a carriage return has no business there.
export function sanitizeFileName(name: string, maxLength: number): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (clean.length <= maxLength) return clean;
  const ext = extensionOf(clean);
  const keep = maxLength - (ext ? ext.length + 1 : 0);
  return ext ? `${clean.slice(0, keep)}.${ext}` : clean.slice(0, maxLength);
}

export type FileCheckResult =
  | { ok: true; contentType: string }
  | { ok: false; code: 'FILE_TYPE_NOT_ALLOWED' | 'FILE_CONTENT_MISMATCH' };

// Verdict on a file: the extension must belong to the list, AND the
// bytes must carry that format's signature. The type announced on upload
// plays no part in the decision.
export function checkFileContent(
  name: string,
  bytes: Uint8Array,
): FileCheckResult {
  const ext = extensionOf(name);
  const kind = FILE_KINDS.find((k) => k.extensions.includes(ext));
  if (!kind) return { ok: false, code: 'FILE_TYPE_NOT_ALLOWED' };
  if (bytes.length === 0 || !kind.check(bytes)) {
    return { ok: false, code: 'FILE_CONTENT_MISMATCH' };
  }
  return { ok: true, contentType: kind.contentType };
}
