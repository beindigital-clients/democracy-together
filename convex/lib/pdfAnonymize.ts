import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRef,
  PDFStream,
  PDFString,
  type PDFObject,
} from 'pdf-lib';

// ANONYMISATION OF A MANUSCRIPT'S METADATA (F-43, double-blind review).
//
// A PDF exported from a word processor almost always carries its author's
// name OUTSIDE the text: `/Author` in the info dictionary, the `dc:creator`
// of its XMP metadata, the author of each comment (`/T` of annotations),
// sometimes the machine name in `/Creator`
// ("Microsoft Word - Jeanne Dupont"). However carefully the author anonymises
// the text, the reviewer only has to open the file properties.
//
// This module produces a COPY without those fields — the only one a reviewer
// receives. It does not touch the page content: a name written in the text
// is the author's responsibility, and the submission form asks them about it.
//
// INCREMENTAL REVISIONS are the trap: a modified PDF often keeps, higher up
// in the file, the old info dictionary — name included — that nothing
// references any more. pdf-lib would rewrite every loaded object, referenced
// or not. The copy is therefore PRUNED: only objects reachable from the
// document root are written.
//
// Pure JavaScript (pdf-lib): runs in the default Convex runtime, and in tests
// without mocking anything.

export type AnonymizeResult =
  | { status: 'clean' | 'stripped'; bytes: Uint8Array; stripped: string[] }
  | { status: 'unreadable'; reason: string };

// Info fields that name a PERSON or their machine. `Title` is replaced by the
// manuscript title (it often carries the file name, "Dupont_article_v3").
const INFO_KEYS = ['Author', 'Creator', 'Producer', 'Subject', 'Keywords'];

// Text of a PDF string, literal `(…)` or hexadecimal `<…>`.
function textOf(obj: PDFObject | undefined): string {
  if (obj instanceof PDFString || obj instanceof PDFHexString) {
    return obj.decodeText();
  }
  return obj ? obj.toString() : '';
}

function nonEmpty(obj: PDFObject | undefined): boolean {
  return textOf(obj).replace(/[()<>\s]/g, '').length > 0;
}

// Objects reachable from the trailer (root, info).
function reachable(doc: PDFDocument): Set<string> {
  const seen = new Set<string>();
  const stack: PDFObject[] = [];
  const { Root, Info } = doc.context.trailerInfo;
  if (Root) stack.push(Root);
  if (Info) stack.push(Info);
  while (stack.length > 0) {
    const obj = stack.pop() as PDFObject;
    if (obj instanceof PDFRef) {
      const key = obj.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      const target = doc.context.lookup(obj);
      if (target) stack.push(target);
    } else if (obj instanceof PDFDict) {
      for (const [, value] of obj.entries()) stack.push(value);
    } else if (obj instanceof PDFArray) {
      stack.push(...obj.asArray());
    } else if (obj instanceof PDFStream) {
      stack.push(obj.dict);
    }
  }
  return seen;
}

export async function anonymizePdf(
  bytes: Uint8Array,
  opts: { title: string },
): Promise<AnonymizeResult> {
  let doc: PDFDocument;
  try {
    // `updateMetadata: false`: otherwise pdf-lib WRITES its own `/Producer` and a
    // modification date — exactly what we are removing.
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (err) {
    return {
      status: 'unreadable',
      reason: err instanceof Error ? err.name || 'PARSE_ERROR' : 'PARSE_ERROR',
    };
  }

  const stripped = new Set<string>();
  const { context, catalog } = doc;

  // 1. Info dictionary.
  const info = context.trailerInfo.Info
    ? context.lookupMaybe(context.trailerInfo.Info, PDFDict)
    : undefined;
  if (info) {
    for (const key of INFO_KEYS) {
      const name = PDFName.of(key);
      if (nonEmpty(info.get(name))) stripped.add(key);
      info.delete(name);
    }
    const oldTitle = info.get(PDFName.of('Title'));
    if (oldTitle && textOf(oldTitle) !== opts.title) stripped.add('Title');
  }
  doc.setTitle(opts.title);

  // 2. XMP metadata (dc:creator, xmp:CreatorTool, pdf:Producer…).
  const metadata = catalog.get(PDFName.of('Metadata'));
  if (metadata) {
    stripped.add('XMP');
    catalog.delete(PDFName.of('Metadata'));
    if (metadata instanceof PDFRef) context.delete(metadata);
  }

  // 3. Private application data (user name, local paths).
  if (catalog.get(PDFName.of('PieceInfo'))) {
    stripped.add('PieceInfo');
    catalog.delete(PDFName.of('PieceInfo'));
  }

  // 4. Pages: their own metadata, and the author of annotations.
  for (const page of doc.getPages()) {
    for (const key of ['Metadata', 'PieceInfo']) {
      if (page.node.get(PDFName.of(key))) {
        stripped.add(key === 'Metadata' ? 'XMP' : 'PieceInfo');
        page.node.delete(PDFName.of(key));
      }
    }
    const annots = page.node.Annots();
    if (!annots) continue;
    for (const item of annots.asArray()) {
      const annot = context.lookupMaybe(item, PDFDict);
      if (!annot) continue;
      if (annot.get(PDFName.of('T'))) {
        stripped.add('AnnotationAuthor');
        annot.delete(PDFName.of('T'));
      }
    }
  }

  // 5. Pruning: orphaned objects (old revisions) are not rewritten. Nothing is
  //    reported here: most modern PDFs have uninteresting orphans
  //    (cross-reference streams, object streams), and whatever named the
  //    author has been counted above.
  const keep = reachable(doc);
  for (const [ref] of context.enumerateIndirectObjects()) {
    if (!keep.has(ref.toString())) context.delete(ref);
  }

  const out = await doc.save({ useObjectStreams: false });
  return {
    status: stripped.size > 0 ? 'stripped' : 'clean',
    bytes: out,
    stripped: [...stripped].sort(),
  };
}
