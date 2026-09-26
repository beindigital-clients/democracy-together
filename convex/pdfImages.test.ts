import { describe, it, expect } from 'vitest';
import { countPages, extractJpegImages, looksLikePdf } from './lib/pdfImages';

// L'extracteur lit des OCTETS, pas une structure : les tests construisent donc
// de vrais fragments de PDF, avec les particularités qui font échouer un
// balayage naïf — le saut de ligne après `stream`, un `/Length` indirect, un
// filtre en tableau, un codage qu'on ne sait pas lire.

const LATIN1 = {
  encode(s: string): Uint8Array {
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
    return out;
  },
};

/** Un JPEG minimal reconnaissable : SOI … EOI. */
function jpeg(payload = 'DONNEES'): Uint8Array {
  const body = LATIN1.encode(payload);
  const out = new Uint8Array(body.length + 4);
  out.set([0xff, 0xd8], 0);
  out.set(body, 2);
  out.set([0xff, 0xd9], body.length + 2);
  return out;
}

function concat(parts: (string | Uint8Array)[]): Uint8Array {
  const chunks = parts.map((p) =>
    typeof p === 'string' ? LATIN1.encode(p) : p,
  );
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

function pdfWithImage({
  filter = '/DCTDecode',
  data = jpeg(),
  length = null as number | null,
  extras = '',
}: {
  filter?: string;
  data?: Uint8Array;
  length?: number | null;
  extras?: string;
} = {}): Uint8Array {
  const len = length === null ? data.length : length;
  return concat([
    '%PDF-1.7\n',
    '4 0 obj\n<< /Type /XObject /Subtype /Image /Width 640 /Height 480 ',
    `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter ${filter} ${extras}/Length ${len} >>\nstream\n`,
    data,
    '\nendstream\nendobj\n',
    '%%EOF\n',
  ]);
}

describe('Reconnaissance du format', () => {
  it('accepte un en-tête %PDF-', () => {
    expect(looksLikePdf(LATIN1.encode('%PDF-1.7\n...'))).toBe(true);
  });

  it('refuse un fichier renommé ou tronqué', () => {
    // Un téléversement interrompu doit échouer ICI, avec un code clair, plutôt
    // qu'à la première expression régulière qui ne trouve rien et rend un
    // document vide sans dire pourquoi.
    expect(looksLikePdf(LATIN1.encode('PK\u0003\u0004'))).toBe(false);
    expect(looksLikePdf(new Uint8Array([0x25, 0x50]))).toBe(false);
    expect(looksLikePdf(new Uint8Array(0))).toBe(false);
  });
});

describe('Extraction des images JPEG', () => {
  it('recopie le flux tel quel, sans ré-encodage', () => {
    const data = jpeg('PHOTO');
    const { images, skipped } = extractJpegImages(pdfWithImage({ data }));
    expect(skipped).toBe(0);
    expect(images).toHaveLength(1);
    expect(images[0].contentType).toBe('image/jpeg');
    // Octet pour octet : c'est ce qui garantit qu'aucune illustration ne perd
    // en qualité en passant par la traduction.
    expect(Array.from(images[0].data)).toEqual(Array.from(data));
  });

  it('lit les dimensions déclarées', () => {
    const { images } = extractJpegImages(pdfWithImage());
    expect(images[0].width).toBe(640);
    expect(images[0].height).toBe(480);
  });

  it('accepte un filtre écrit en tableau', () => {
    // `/Filter[/DCTDecode]` est aussi courant que `/Filter /DCTDecode`.
    const { images } = extractJpegImages(
      pdfWithImage({ filter: '[/DCTDecode]' }),
    );
    expect(images).toHaveLength(1);
  });

  it('retombe sur `endstream` quand /Length est une référence indirecte', () => {
    // `/Length 42 0 R` : le nombre lu est un NUMÉRO D'OBJET, pas une longueur.
    // S'y fier couperait le JPEG n'importe où. La fin calculée ne tombant pas
    // sur `endstream`, l'extracteur cherche le marqueur.
    const data = jpeg('INDIRECT');
    const bytes = concat([
      '%PDF-1.7\n4 0 obj\n<< /Subtype /Image /Width 10 /Height 10 ',
      '/Filter /DCTDecode /Length 42 0 R >>\nstream\n',
      data,
      '\nendstream\nendobj\n%%EOF',
    ]);
    const { images } = extractJpegImages(bytes);
    expect(images).toHaveLength(1);
    expect(Array.from(images[0].data)).toEqual(Array.from(data));
  });

  it('gère un saut de ligne CRLF après `stream`', () => {
    // Se tromper d'un octet ici décale tout le JPEG et le rend illisible.
    const data = jpeg('CRLF');
    const bytes = concat([
      '%PDF-1.7\n4 0 obj\n<< /Subtype /Image /Filter /DCTDecode /Length ',
      String(data.length),
      ' >>\nstream\r\n',
      data,
      '\r\nendstream\nendobj\n%%EOF',
    ]);
    const { images } = extractJpegImages(bytes);
    expect(images).toHaveLength(1);
    expect(Array.from(images[0].data)).toEqual(Array.from(data));
  });

  it('numérote les images dans l’ordre du fichier', () => {
    // C'est cet ordre qui relie une figure à son illustration : s'il change,
    // les images du document traduit se retrouvent aux mauvais endroits.
    const bytes = concat([
      pdfWithImage({ data: jpeg('UN') }),
      pdfWithImage({ data: jpeg('DEUX') }),
      pdfWithImage({ data: jpeg('TROIS') }),
    ]);
    const { images } = extractJpegImages(bytes);
    expect(images.map((i) => i.index)).toEqual([0, 1, 2]);
    expect(
      images.map((i) =>
        String.fromCharCode(...i.data.subarray(2, i.data.length - 2)),
      ),
    ).toEqual(['UN', 'DEUX', 'TROIS']);
  });

  it('compte — sans les lire — les images d’un codage non pris en charge', () => {
    // Le comptage n'est pas décoratif : c'est lui qui fait afficher un renvoi
    // vers le PDF d'origine à l'emplacement de la figure, plutôt qu'une page
    // qui paraît complète et ne l'est pas.
    const bytes = concat([
      pdfWithImage({ filter: '/FlateDecode', data: LATIN1.encode('xxxx') }),
      pdfWithImage({ filter: '/JPXDecode', data: LATIN1.encode('yyyy') }),
      pdfWithImage({ data: jpeg('OK') }),
    ]);
    const { images, skipped } = extractJpegImages(bytes);
    expect(images).toHaveLength(1);
    expect(skipped).toBe(2);
  });

  it('écarte un flux annoncé JPEG qui n’en est pas un', () => {
    const bytes = pdfWithImage({ data: LATIN1.encode('pas un jpeg') });
    const { images, skipped } = extractJpegImages(bytes);
    expect(images).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it('respecte le plafond', () => {
    const bytes = concat(
      Array.from({ length: 6 }, (_, i) =>
        pdfWithImage({ data: jpeg(`I${i}`) }),
      ),
    );
    expect(extractJpegImages(bytes, 2).images).toHaveLength(2);
  });

  it('ne trouve rien dans un PDF sans image, et ne lève pas', () => {
    const bytes = LATIN1.encode(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF',
    );
    expect(extractJpegImages(bytes)).toEqual({ images: [], skipped: 0 });
  });
});

describe('Nombre de pages', () => {
  it('lit /Count du nœud racine', () => {
    const bytes = LATIN1.encode(
      '%PDF-1.7\n2 0 obj\n<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 12 >>\nendobj',
    );
    expect(countPages(bytes)).toBe(12);
  });

  it('retombe sur le comptage des objets /Type /Page', () => {
    const bytes = LATIN1.encode(
      '%PDF-1.7\n3 0 obj << /Type /Page >> endobj 4 0 obj << /Type /Page >> endobj',
    );
    expect(countPages(bytes)).toBe(2);
  });

  it('rend `undefined` plutôt qu’un chiffre inventé', () => {
    expect(countPages(LATIN1.encode('%PDF-1.7\nrien'))).toBeUndefined();
  });
});
