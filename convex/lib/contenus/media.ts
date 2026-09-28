import { looksLikePdf } from '../pdfImages';

// MEDIA LIBRARY (F-64) — what a file IS, read from its bytes.
//
// Same rule as the library (`convex/documents.ts`, `looksLikePdf`): we
// trust neither the extension nor the type announced by the browser at
// upload — both can be forged with a `curl`. The type retained is the one
// revealed by the first bytes; a file we do not recognize is
// refused and deleted from storage.
//
// SVG DELIBERATELY EXCLUDED. An SVG is an XML document that can carry
// script: served from Convex storage and opened directly, it
// would run in the storage origin. Logos are uploaded as PNG,
// WebP or JPEG — and the alternative text remains mandatory.

export type MediaKind = 'image' | 'pdf';

export type SniffedMedia = {
  kind: MediaKind;
  contentType:
    'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'application/pdf';
  width?: number;
  height?: number;
};

// Size bounds per kind of file. A web page image has no
// reason to exceed 5 MB; a PDF (program, press kit) follows the
// library's bound, 20 MB.
export const MEDIA_MAX_BYTES: Record<MediaKind, number> = {
  image: 5 * 1024 * 1024,
  pdf: 20 * 1024 * 1024,
};

// Capped dimensions: beyond them, the image is probably a mistake
// (raw scan) and would be expensive on every display.
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
  // 8-byte signature then IHDR chunk: width and height as big-endian u32.
  if (b.length < 24 || ascii(b, 12, 4) !== 'IHDR') return null;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

function gifSize(b: Uint8Array) {
  if (b.length < 10) return null;
  return { width: u16le(b, 6), height: u16le(b, 8) };
}

function jpegSize(b: Uint8Array) {
  // Walk the segments up to the first SOFn, which carries the dimensions.
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
 * Actual kind of a file based on its first bytes, with the dimensions
 * for an image. `null`: type not accepted (or unreadable file).
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
  // An image whose dimensions we cannot read is not a valid
  // image — it is often a truncated file that would display broken.
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

/** File name sanitized for display (no path, bounded). */
export function cleanFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // Control characters removed: the name is displayed and exported as is.
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (cleaned || 'fichier').slice(0, 160);
}
