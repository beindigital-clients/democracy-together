// EXTRACTING IMAGES FROM A PDF — byte reading, no dependency.
//
// WHY THIS FILE EXISTS. Translating a document (convex/documents.ts) rebuilds
// its text in another language. A model can read a PDF and return its text;
// it cannot return its IMAGES. Without them, a translated report would lose
// its photographs and charts — which is often its most compelling part. They
// therefore have to be fetched from the file, and that is all this module
// does.
//
// WHY NO LIBRARY. `pdfjs-dist` weighs several megabytes and pulls in a
// worker; `pdf-lib` cannot decode image streams. The repo has already decided
// twice in favour of a hand-written adapter rather than an SDK (Resend,
// reCAPTCHA, and the AI gateway itself); the need here is narrower still.
//
// WHAT THIS MODULE CAN DO, AND WHAT IT CANNOT.
//
// It extracts images encoded with **DCTDecode**, i.e. JPEG. This case is not
// chosen for convenience: the stream of a `/DCTDecode` XObject IS a complete
// JPEG file, byte for byte. Extracting it means copying it — no decoding, no
// re-encoding, no loss. It is also the encoding of almost all photographs and
// raster figures produced by common publishing pipelines (InDesign, Word,
// LaTeX, Google Docs exports).
//
// It CANNOT extract:
//   - **FlateDecode** images (compressed raw bitmaps): returning them would
//     require decompressing then re-encoding to PNG, hence a full PNG encoder
//     — CRC32, per-row filtering, zlib stream — for a case that is a minority
//     in an editorial PDF;
//   - **JPXDecode** images (JPEG 2000), which browsers cannot display anyway;
//   - **vector graphics**, which are not images at all but drawing
//     instructions in the page's content stream.
//
// These three cases are not silent: `extractJpegImages` ALSO returns the
// number of images it saw but could not read (`skipped`), and the document
// view then shows a link to the original PDF where the figure belongs. The
// reader knows something is missing and where to find it — which is
// infinitely better than a page that looks complete and is not.

export type ExtractedImage = {
  /** Rank in the file, in order of appearance. Used to link a figure. */
  index: number;
  data: Uint8Array;
  contentType: string;
  width?: number;
  height?: number;
};

export type ImageExtraction = {
  images: ExtractedImage[];
  /** Images found but in an encoding this module does not read. */
  skipped: number;
};

// PDFs mix text and binary. `latin1` maps one byte to one and only one code
// point: it is the only encoding that lets us search for ASCII patterns in the
// file without the decoder inventing replacement characters — and therefore
// without the offsets found drifting away from the bytes.
const LATIN1 = new TextDecoder('latin1');

/** Value of a PDF dictionary key, when it is written in plain form. */
function dictNumber(dict: string, key: string): number | undefined {
  const m = new RegExp(`/${key}\\s+(\\d+)`).exec(dict);
  return m ? Number(m[1]) : undefined;
}

function dictHasName(dict: string, key: string, name: string): boolean {
  // `/Filter /DCTDecode` as well as `/Filter[/DCTDecode]`: the space is
  // optional and the filter may be alone or in an array.
  return new RegExp(`/${key}\\s*\\[?\\s*/${name}\\b`).test(dict);
}

/**
 * The JPEG images of a PDF, in order of appearance.
 *
 * @param bytes the whole file
 * @param max   safety cap: a pathological PDF must not blow up an action's
 *              memory or the storage.
 */
export function extractJpegImages(
  bytes: Uint8Array,
  max = 40,
): ImageExtraction {
  const text = LATIN1.decode(bytes);
  const images: ExtractedImage[] = [];
  let skipped = 0;

  // An image object is an indirect object whose dictionary carries
  // `/Subtype /Image`, followed by its stream. STREAM objects cannot live in an
  // `/ObjStm` (the specification forbids it), so this scan finds them even in
  // PDF 1.5+ files with cross-reference streams — which is what makes the
  // approach viable without a full parser.
  const objRe = /\/Subtype\s*\/Image\b/g;
  let m: RegExpExecArray | null;

  while ((m = objRe.exec(text)) !== null) {
    if (images.length >= max) break;

    // Start of the dictionary: the nearest preceding "<<".
    const dictStart = text.lastIndexOf('<<', m.index);
    if (dictStart < 0) continue;
    const streamAt = text.indexOf('stream', m.index);
    if (streamAt < 0) continue;
    const dict = text.slice(dictStart, streamAt);

    if (!dictHasName(dict, 'Filter', 'DCTDecode')) {
      // An image, but not in an encoding we know how to copy.
      skipped++;
      continue;
    }

    // After the `stream` keyword comes EXACTLY one CRLF or one LF, never a lone
    // CR (PDF 32000-1, 7.3.8.1). Being off by one byte corrupts the JPEG.
    let dataStart = streamAt + 'stream'.length;
    if (text[dataStart] === '\r') dataStart++;
    if (text[dataStart] === '\n') dataStart++;

    // `/Length` gives the size when it is written in plain form. It may be an
    // indirect reference (`/Length 42 0 R`): `dictNumber` then reads the first
    // number, which is the object number and not a length. So we rely on it ONLY
    // if the end computed this way lands exactly on `endstream`.
    const declared = dictNumber(dict, 'Length');
    let dataEnd = -1;
    if (declared !== undefined && declared > 0) {
      const candidate = dataStart + declared;
      const after = text.slice(candidate, candidate + 20);
      if (/^\s*endstream/.test(after)) dataEnd = candidate;
    }
    if (dataEnd < 0) {
      const found = text.indexOf('endstream', dataStart);
      if (found < 0) continue;
      // Strip the line break the producer inserts before `endstream`.
      dataEnd = found;
      if (text[dataEnd - 1] === '\n') dataEnd--;
      if (text[dataEnd - 1] === '\r') dataEnd--;
    }
    if (dataEnd <= dataStart) continue;

    const data = bytes.subarray(dataStart, dataEnd);
    // A JPEG starts with FF D8 and ends with FF D9. The check is not decorative:
    // it rules out cases where the scan picked the wrong stream, and avoids
    // storing then serving a file the browser will reject.
    if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) {
      skipped++;
      continue;
    }

    images.push({
      index: images.length,
      data,
      contentType: 'image/jpeg',
      width: dictNumber(dict, 'Width'),
      height: dictNumber(dict, 'Height'),
    });
  }

  return { images, skipped };
}

/**
 * Number of pages in the document.
 *
 * Read for one reason only: the document view shows it next to the link to
 * the original, so the reader knows what they are comparing. `/Count` of the
 * root pages node is the authoritative value; failing that, we count the
 * `/Type /Page` objects, which gives the same result on a well-formed PDF.
 */
export function countPages(bytes: Uint8Array): number | undefined {
  const text = LATIN1.decode(bytes);
  const pagesNode = /\/Type\s*\/Pages\b[\s\S]{0,400}?\/Count\s+(\d+)/.exec(
    text,
  );
  if (pagesNode) return Number(pagesNode[1]);
  const matches = text.match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : undefined;
}

/**
 * Is the file really a PDF?
 *
 * `%PDF-` header. A renamed file, or an interrupted upload, must fail HERE
 * with a clear code rather than at the first regular expression that finds
 * nothing and returns an empty document.
 */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return (
    bytes.length > 5 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d // -
  );
}
