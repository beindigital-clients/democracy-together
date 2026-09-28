import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { anonymizePdf } from './pdfAnonymize';

// Double aveugle (F-43) : la copie remise au relecteur ne doit porter le nom
// de l'auteur dans AUCUNE métadonnée — dictionnaire d'information, XMP,
// annotations, ni dans une ancienne révision restée dans le fichier.

const AUTHOR = 'Jeanne Autrice';

async function manuscriptWithIdentity(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 400]);
  page.drawText('Texte anonyme du manuscrit.', { x: 40, y: 300, size: 12 });
  doc.setTitle('Dupont_article_v3');
  doc.setAuthor(AUTHOR);
  doc.setCreator(`Microsoft Word - ${AUTHOR}`);
  doc.setProducer('Word 16');
  doc.setSubject(`Article de ${AUTHOR}`);
  doc.setKeywords([AUTHOR]);
  // Métadonnées XMP, comme les écrit un traitement de texte.
  const xmp = doc.context.stream(
    `<x:xmpmeta xmlns:x="adobe:ns:meta/"><dc:creator>${AUTHOR}</dc:creator></x:xmpmeta>`,
    { Type: 'Metadata', Subtype: 'XML' },
  );
  doc.catalog.set(PDFName.of('Metadata'), doc.context.register(xmp));
  // Un commentaire signé.
  const annot = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Text',
    Rect: [10, 10, 30, 30],
    Contents: PDFString.of('À revoir'),
    T: PDFString.of(AUTHOR),
  });
  page.node.set(
    PDFName.of('Annots'),
    doc.context.obj([doc.context.register(annot)]),
  );
  // Une ancienne révision orpheline qui garde le nom : un dictionnaire
  // d'information que plus rien ne référence.
  doc.context.register(doc.context.obj({ Author: PDFString.of(AUTHOR) }));
  return await doc.save({ useObjectStreams: false });
}

const latin1 = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => String.fromCharCode(b)).join('');

describe('Anonymisation des métadonnées PDF (F-43)', () => {
  it('retire auteur, logiciel, XMP, auteurs d’annotations et révisions orphelines', async () => {
    const source = await manuscriptWithIdentity();
    expect(latin1(source)).toContain(AUTHOR);

    const res = await anonymizePdf(source, { title: 'Titre neutre' });
    expect(res.status).toBe('stripped');
    if (res.status === 'unreadable') return;
    expect(res.stripped).toEqual(
      expect.arrayContaining([
        'AnnotationAuthor',
        'Author',
        'Creator',
        'Keywords',
        'Subject',
        'Title',
        'XMP',
      ]),
    );

    // Le nom n'est plus NULLE PART dans le fichier (flux non compressés :
    // la recherche d'octets suffit).
    expect(latin1(res.bytes)).not.toContain(AUTHOR);
    expect(latin1(res.bytes)).not.toContain('Jeanne');

    const reread = await PDFDocument.load(res.bytes, { updateMetadata: false });
    expect(reread.getAuthor()).toBeUndefined();
    expect(reread.getCreator()).toBeUndefined();
    expect(reread.getTitle()).toBe('Titre neutre');
    expect(reread.catalog.get(PDFName.of('Metadata'))).toBeUndefined();
    // Le contenu des pages est intact.
    expect(reread.getPageCount()).toBe(1);
  });

  it('un PDF sans métadonnée d’identité est dit « clean »', async () => {
    const doc = await PDFDocument.create({ updateMetadata: false });
    doc.addPage();
    doc.setTitle('Titre neutre');
    const res = await anonymizePdf(await doc.save(), { title: 'Titre neutre' });
    expect(res.status).toBe('clean');
  });

  it('un fichier illisible n’est pas transmis : « unreadable »', async () => {
    const res = await anonymizePdf(new TextEncoder().encode('pas un PDF'), {
      title: 'x',
    });
    expect(res.status).toBe('unreadable');
  });
});
