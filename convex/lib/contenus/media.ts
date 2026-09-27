import { looksLikePdf } from '../pdfImages';

// MÉDIATHÈQUE (F-64) — ce qu'un fichier EST, lu dans ses octets.
//
// Même règle que la bibliothèque (`convex/documents.ts`, `looksLikePdf`) : on
// ne croit ni l'extension, ni le type annoncé par le navigateur au
// téléversement — les deux se forgent d'un `curl`. Le type retenu est celui
// que révèlent les premiers octets ; un fichier qu'on ne reconnaît pas est
// refusé et supprimé du stockage.
//
// SVG VOLONTAIREMENT EXCLU. Un SVG est un document XML qui peut porter du
// script : servi depuis le stockage Convex et ouvert directement, il
// s'exécuterait dans l'origine du stockage. Les logos se téléversent en PNG,
// WebP ou JPEG — et le texte alternatif, lui, reste obligatoire.

export type MediaKind = 'image' | 'pdf';

export type SniffedMedia = {
  kind: MediaKind;
  contentType:
    'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'application/pdf';
  width?: number;
  height?: number;
};

// Bornes de taille par nature de fichier. Une image de page web n'a aucune
// raison de dépasser 5 Mo ; un PDF (programme, dossier de presse) suit la
// borne de la bibliothèque, 20 Mo.
export const MEDIA_MAX_BYTES: Record<MediaKind, number> = {
  image: 5 * 1024 * 1024,
  pdf: 20 * 1024 * 1024,
};

// Dimensions plafonnées : au-delà, l'image est probablement une erreur
// (scan brut) et coûterait cher à chaque affichage.
export const MEDIA_MAX_DIMENSION = 12000;

function u16be(b: Uint8Array, i: number): number {
  return (b[i] << 8) | b[i + 1];
}
function u32be(b: Uint8Array, i: number): number {
  return ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
}
function u16le(b: Uint8Array, i: number): number {
  return b[i] | (b[i + 1] << 8);
}
function u24le(b: Uint8Array, i: number): number {
  return b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
}
function ascii(b: Uint8Array, i: number, n: number): string {
  return String.fromCharCode(...b.subarray(i, i + n));
}

function pngSize(b: Uint8Array) {
  // Signature 8 octets puis bloc IHDR : largeur et hauteur en u32 big-endian.
  if (b.length < 24 || ascii(b, 12, 4) !== 'IHDR') return null;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

function gifSize(b: Uint8Array) {
  if (b.length < 10) return null;
  return { width: u16le(b, 6), height: u16le(b, 8) };
}

function jpegSize(b: Uint8Array) {
  // Parcours des segments jusqu'au premier SOFn, qui porte les dimensions.
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (
      marker === 0xd8 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      i += 2;
      continue;
    }
    const len = u16be(b, i + 2);
    const isSof =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isSof) return { height: u16be(b, i + 5), width: u16be(b, i + 7) };
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

function webpSize(b: Uint8Array) {
  if (b.length < 30) return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === 'VP8X') {
    return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  }
  if (chunk === 'VP8 ') {
    return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

/**
 * Nature réelle d'un fichier d'après ses premiers octets, avec les dimensions
 * pour une image. `null` : type non accepté (ou fichier illisible).
 */
export function sniffMedia(bytes: Uint8Array): SniffedMedia | null {
  const b = bytes;
  if (looksLikePdf(b)) return { kind: 'pdf', contentType: 'application/pdf' };

  let size: { width: number; height: number } | null = null;
  let contentType: SniffedMedia['contentType'] | null = null;
  if (
    b.length > 8 &&
    b[0] === 0x89 &&
    ascii(b, 1, 3) === 'PNG' &&
    b[4] === 0x0d &&
    b[5] === 0x0a
  ) {
    contentType = 'image/png';
    size = pngSize(b);
  } else if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    contentType = 'image/jpeg';
    size = jpegSize(b);
  } else if (
    b.length > 12 &&
    ascii(b, 0, 4) === 'RIFF' &&
    ascii(b, 8, 4) === 'WEBP'
  ) {
    contentType = 'image/webp';
    size = webpSize(b);
  } else if (
    b.length > 6 &&
    (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a')
  ) {
    contentType = 'image/gif';
    size = gifSize(b);
  }
  if (!contentType) return null;
  // Une image dont on ne sait pas lire les dimensions n'est pas une image
  // valide — c'est souvent un fichier tronqué qui s'afficherait cassé.
  if (
    !size ||
    size.width < 1 ||
    size.height < 1 ||
    size.width > MEDIA_MAX_DIMENSION ||
    size.height > MEDIA_MAX_DIMENSION
  ) {
    return null;
  }
  return { kind: 'image', contentType, width: size.width, height: size.height };
}

/** Nom de fichier assaini pour l'affichage (pas de chemin, borné). */
export function cleanFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // Caractères de contrôle retirés : le nom est affiché et exporté tel quel.
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (cleaned || 'fichier').slice(0, 160);
}
