// EXTRACTION DES IMAGES D'UN PDF — lecture d'octets, sans dépendance.
//
// POURQUOI CE FICHIER EXISTE. La traduction d'un document (convex/documents.ts)
// reconstruit son texte dans une autre langue. Un modèle peut lire un PDF et en
// rendre le texte ; il ne peut pas en rendre les IMAGES. Sans elles, un rapport
// traduit perdrait ses photographies et ses graphiques — c'est-à-dire souvent
// ce qu'il a de plus démonstratif. Il faut donc aller les chercher dans le
// fichier, et c'est tout ce que fait ce module.
//
// POURQUOI SANS BIBLIOTHÈQUE. `pdfjs-dist` pèse plusieurs mégaoctets et tire un
// worker ; `pdf-lib` ne sait pas décoder les flux d'image. Le dépôt a déjà
// tranché deux fois en faveur d'un adaptateur écrit à la main plutôt que d'un
// SDK (Resend, reCAPTCHA, et la passerelle IA elle-même) ; le besoin ici est
// plus étroit encore.
//
// CE QUE CE MODULE SAIT FAIRE, ET CE QU'IL NE SAIT PAS.
//
// Il extrait les images encodées en **DCTDecode**, c'est-à-dire en JPEG. Ce
// cas n'est pas choisi par facilité : le flux d'un XObject `/DCTDecode` EST un
// fichier JPEG complet, octet pour octet. L'extraire, c'est le recopier — il
// n'y a ni décodage, ni ré-encodage, ni perte. C'est aussi le codage de la
// quasi-totalité des photographies et des figures tramées produites par les
// chaînes éditoriales courantes (export InDesign, Word, LaTeX, Google Docs).
//
// Il NE sait PAS extraire :
//   - les images **FlateDecode** (bitmaps bruts compressés) : les rendre
//     demanderait de décompresser puis de ré-encoder en PNG, donc un encodeur
//     PNG complet — CRC32, filtrage par ligne, flux zlib — pour un cas qui,
//     dans un PDF éditorial, est minoritaire ;
//   - les images **JPXDecode** (JPEG 2000), que les navigateurs ne savent de
//     toute façon pas afficher ;
//   - les **graphiques vectoriels**, qui ne sont pas des images du tout mais
//     des instructions de tracé dans le flux de contenu de la page.
//
// Ces trois cas ne sont pas silencieux : `extractJpegImages` renvoie AUSSI le
// nombre d'images qu'elle a vues sans pouvoir les lire (`skipped`), et la vue
// document affiche alors un renvoi vers le PDF d'origine à l'emplacement de la
// figure. Le lecteur sait qu'il manque quelque chose et où le trouver — ce qui
// vaut infiniment mieux qu'une page qui paraît complète et ne l'est pas.

export type ExtractedImage = {
  /** Rang dans le fichier, en ordre d'apparition. Sert à relier une figure. */
  index: number;
  data: Uint8Array;
  contentType: string;
  width?: number;
  height?: number;
};

export type ImageExtraction = {
  images: ExtractedImage[];
  /** Images repérées mais dans un codage que ce module ne lit pas. */
  skipped: number;
};

// Les PDF mêlent texte et binaire. `latin1` associe un octet à un point de code
// et un seul : c'est le seul encodage qui permet de chercher des motifs ASCII
// dans le fichier sans que le décodeur invente des caractères de remplacement
// — et donc sans que les décalages trouvés cessent de correspondre aux octets.
const LATIN1 = new TextDecoder('latin1');

/** Valeur d'une clé de dictionnaire PDF, quand elle est écrite en clair. */
function dictNumber(dict: string, key: string): number | undefined {
  const m = new RegExp(`/${key}\\s+(\\d+)`).exec(dict);
  return m ? Number(m[1]) : undefined;
}

function dictHasName(dict: string, key: string, name: string): boolean {
  // `/Filter /DCTDecode` comme `/Filter[/DCTDecode]` : l'espace est optionnel
  // et le filtre peut être seul ou dans un tableau.
  return new RegExp(`/${key}\\s*\\[?\\s*/${name}\\b`).test(dict);
}

/**
 * Les images JPEG d'un PDF, en ordre d'apparition.
 *
 * @param bytes le fichier entier
 * @param max   plafond de sécurité : un PDF pathologique ne doit pas faire
 *              exploser la mémoire d'une action ni le stockage.
 */
export function extractJpegImages(
  bytes: Uint8Array,
  max = 40,
): ImageExtraction {
  const text = LATIN1.decode(bytes);
  const images: ExtractedImage[] = [];
  let skipped = 0;

  // Un objet image est un objet indirect dont le dictionnaire porte
  // `/Subtype /Image`, suivi de son flux. Les objets à FLUX ne peuvent pas
  // vivre dans un `/ObjStm` (la spécification l'interdit), donc ce balayage
  // les trouve y compris dans les PDF 1.5+ à flux de références croisées —
  // c'est ce qui rend l'approche viable sans analyseur complet.
  const objRe = /\/Subtype\s*\/Image\b/g;
  let m: RegExpExecArray | null;

  while ((m = objRe.exec(text)) !== null) {
    if (images.length >= max) break;

    // Début du dictionnaire : le « << » qui précède, au plus près.
    const dictStart = text.lastIndexOf('<<', m.index);
    if (dictStart < 0) continue;
    const streamAt = text.indexOf('stream', m.index);
    if (streamAt < 0) continue;
    const dict = text.slice(dictStart, streamAt);

    if (!dictHasName(dict, 'Filter', 'DCTDecode')) {
      // Une image, mais pas dans un codage qu'on sait recopier.
      skipped++;
      continue;
    }

    // Après le mot-clé `stream` vient EXACTEMENT un CRLF ou un LF, jamais un
    // CR seul (PDF 32000-1, 7.3.8.1). Se tromper d'un octet corrompt le JPEG.
    let dataStart = streamAt + 'stream'.length;
    if (text[dataStart] === '\r') dataStart++;
    if (text[dataStart] === '\n') dataStart++;

    // `/Length` donne la taille quand elle est écrite en clair. Elle peut être
    // une référence indirecte (`/Length 42 0 R`) : `dictNumber` lit alors le
    // premier nombre, qui est le numéro d'objet et non une longueur. On ne s'y
    // fie donc QUE si la fin ainsi calculée tombe bien sur `endstream`.
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
      // Retirer le saut de ligne que le producteur insère avant `endstream`.
      dataEnd = found;
      if (text[dataEnd - 1] === '\n') dataEnd--;
      if (text[dataEnd - 1] === '\r') dataEnd--;
    }
    if (dataEnd <= dataStart) continue;

    const data = bytes.subarray(dataStart, dataEnd);
    // Un JPEG commence par FF D8 et finit par FF D9. Le contrôle n'est pas
    // décoratif : il écarte les cas où le balayage s'est trompé de flux, et
    // évite de stocker puis de servir un fichier que le navigateur refusera.
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
 * Nombre de pages du document.
 *
 * Lu pour une seule raison : la vue document l'affiche à côté du renvoi vers
 * l'original, pour que le lecteur sache ce qu'il compare. `/Count` du nœud
 * racine des pages est la valeur faisant autorité ; à défaut, on compte les
 * objets `/Type /Page`, ce qui donne le même résultat sur un PDF bien formé.
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
 * Le fichier est-il bien un PDF ?
 *
 * En-tête `%PDF-`. Un fichier renommé, ou un téléversement interrompu, doit
 * échouer ICI avec un code clair plutôt qu'à la première expression régulière
 * qui ne trouve rien et rend un document vide.
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
