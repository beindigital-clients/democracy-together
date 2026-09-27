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

// ANONYMISATION DES MÉTADONNÉES D'UN MANUSCRIT (F-43, double aveugle).
//
// Un PDF exporté d'un traitement de texte porte presque toujours le nom de
// son auteur HORS du texte : `/Author` du dictionnaire d'information, le
// `dc:creator` de ses métadonnées XMP, l'auteur de chaque commentaire
// (`/T` des annotations), parfois le nom du poste dans `/Creator`
// (« Microsoft Word - Jeanne Dupont »). L'auteur a beau anonymiser son texte,
// le relecteur n'a qu'à ouvrir les propriétés du fichier.
//
// Ce module en produit une COPIE sans ces champs — la seule que reçoit un
// relecteur. Il ne touche pas au contenu des pages : un nom écrit dans le
// texte relève de l'auteur, et le formulaire de soumission le lui demande.
//
// Les RÉVISIONS INCRÉMENTALES sont le piège : un PDF modifié garde souvent,
// plus haut dans le fichier, l'ancien dictionnaire d'information — nom
// compris — que plus rien ne référence. pdf-lib réécrirait tout objet chargé,
// référencé ou non. La copie est donc ÉLAGUÉE : seuls les objets atteignables
// depuis la racine du document sont écrits.
//
// Pur JavaScript (pdf-lib) : s'exécute dans le runtime Convex par défaut, et
// dans les tests sans rien simuler.

export type AnonymizeResult =
  | { status: 'clean' | 'stripped'; bytes: Uint8Array; stripped: string[] }
  | { status: 'unreadable'; reason: string };

// Champs d'information qui nomment une PERSONNE ou son poste. `Title` est
// remplacé par le titre du manuscrit (il porte souvent le nom du fichier,
// « Dupont_article_v3 »).
const INFO_KEYS = ['Author', 'Creator', 'Producer', 'Subject', 'Keywords'];

// Texte d'une chaîne PDF, littérale `(…)` ou hexadécimale `<…>`.
function textOf(obj: PDFObject | undefined): string {
  if (obj instanceof PDFString || obj instanceof PDFHexString) {
    return obj.decodeText();
  }
  return obj ? obj.toString() : '';
}

function nonEmpty(obj: PDFObject | undefined): boolean {
  return textOf(obj).replace(/[()<>\s]/g, '').length > 0;
}

// Objets atteignables depuis la bande-annonce (racine, information).
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
    // `updateMetadata: false` : sans cela pdf-lib ÉCRIT son propre
    // `/Producer` et une date de modification — exactement ce qu'on retire.
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (err) {
    return {
      status: 'unreadable',
      reason: err instanceof Error ? err.name || 'PARSE_ERROR' : 'PARSE_ERROR',
    };
  }

  const stripped = new Set<string>();
  const { context, catalog } = doc;

  // 1. Dictionnaire d'information.
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

  // 2. Métadonnées XMP (dc:creator, xmp:CreatorTool, pdf:Producer…).
  const metadata = catalog.get(PDFName.of('Metadata'));
  if (metadata) {
    stripped.add('XMP');
    catalog.delete(PDFName.of('Metadata'));
    if (metadata instanceof PDFRef) context.delete(metadata);
  }

  // 3. Données privées d'application (nom d'utilisateur, chemins locaux).
  if (catalog.get(PDFName.of('PieceInfo'))) {
    stripped.add('PieceInfo');
    catalog.delete(PDFName.of('PieceInfo'));
  }

  // 4. Pages : leurs propres métadonnées, et l'auteur des annotations.
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

  // 5. Élagage : les objets orphelins (anciennes révisions) ne sont pas
  //    réécrits. Rien n'est rapporté ici : la plupart des PDF modernes ont
  //    des orphelins sans intérêt (flux de références croisées, conteneurs
  //    d'objets), et ce qui nommait l'auteur a été compté plus haut.
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
