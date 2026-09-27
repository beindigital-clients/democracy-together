// VÉRIFICATION DU CONTENU d'un fichier partagé (espaces collaboratifs, F-24).
//
// Trois sources d'information sur un fichier, et une seule est fiable :
//   - le NOM (et son extension) : choisi par le déposant ;
//   - le TYPE annoncé à l'envoi (`contentType` du blob) : choisi par le
//     navigateur du déposant, donc par lui ;
//   - les OCTETS : ce que le fichier est réellement.
// Un exécutable renommé `rapport.pdf` et envoyé avec `application/pdf` passe
// les deux premiers contrôles. D'où la règle : on n'accepte un fichier que si
// ses premiers octets portent la SIGNATURE du format que son extension
// annonce. Le contrôle est pur (des octets en entrée, un verdict en sortie) :
// il se teste sans stockage, et l'action qui l'appelle n'a rien à décider.

export type FileKind = {
  // Extensions acceptées pour ce format (minuscules, sans point).
  extensions: readonly string[];
  // Type servi au téléchargement — celui du FORMAT reconnu, jamais celui
  // annoncé par le déposant.
  contentType: string;
  // Vérification des octets.
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
// Conteneur ZIP : les formats bureautiques ouverts (OOXML, OpenDocument) en
// sont. La signature ne distingue pas un .docx d'un .zip quelconque ; on
// cherche en plus, dans l'en-tête, le nom d'entrée propre au format.
const ZIP = [0x50, 0x4b, 0x03, 0x04];

function containsAscii(bytes: Uint8Array, needle: string, limit = 4096) {
  const n = ascii(needle);
  const end = Math.min(bytes.length, limit) - n.length;
  for (let i = 0; i <= end; i++) {
    if (startsWith(bytes, n, i)) return true;
  }
  return false;
}

// Texte : UTF-8 VALIDE et sans octet nul. Un binaire quelconque échoue sur
// l'un ou l'autre presque toujours ; un texte légitime passe toujours.
//
// Validation écrite à la main plutôt que `TextDecoder({ fatal: true })` : le
// runtime Convex n'est pas un navigateur, et une option ignorée en silence
// ferait passer n'importe quel binaire pour du texte.
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
    // Séquence tronquée en fin de fichier : `c` vaut undefined, refusée.
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
// Un OpenDocument commence par l'entrée `mimetype`, non compressée, qui porte
// le type : c'est la convention du format, et elle rend le contrôle exact.
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

// Liste affichée dans le formulaire (attribut `accept`) — dérivée, jamais
// recopiée.
export const ACCEPTED_EXTENSIONS: readonly string[] = FILE_KINDS.flatMap(
  (k) => k.extensions,
);

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

// Nom de fichier affiché : sans chemin, sans caractères de contrôle, borné.
// Le nom est une donnée utilisateur rendue dans l'interface et proposée au
// téléchargement : un « ../ » ou un retour chariot n'y ont rien à faire.
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

// Verdict sur un fichier : l'extension doit appartenir à la liste, ET les
// octets doivent porter la signature de ce format. Le type annoncé à l'envoi
// n'entre pas dans la décision.
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
