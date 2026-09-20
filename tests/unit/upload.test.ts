import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  UPLOAD_FAILED,
  uploadWithProgress,
  type UploadProgress,
} from '@/lib/upload';

// TÉLÉVERSEMENT AVEC PROGRESSION (issue #37).
//
// Ce que ces tests tiennent : la progression est bien LUE sur `upload`, la
// réponse est rendue telle quelle, et tout échec — statut, réseau, réponse
// illisible — arrive à l'appelant sous la même forme, celle qu'il sait traduire
// en « réessayez ».
//
// La vraie raison d'être du module est invérifiable autrement : `fetch`
// n'expose pas la progression d'envoi. On simule donc XMLHttpRequest, seule
// API qui l'expose, et on éprouve le câblage qu'on en fait.

type ProgressInit = {
  loaded: number;
  total: number;
  lengthComputable: boolean;
};

class FakeXhr {
  static last: FakeXhr | null = null;

  status = 200;
  responseText = '{}';
  readonly headers: Record<string, string> = {};
  readonly upload: { onprogress?: (event: ProgressInit) => void } = {};
  sent: unknown = null;
  method = '';
  url = '';

  onload?: () => void;
  onerror?: () => void;
  ontimeout?: () => void;
  onabort?: () => void;

  constructor() {
    FakeXhr.last = this;
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  // L'envoi ne résout rien de lui-même : chaque test joue la suite qu'il veut
  // éprouver (progression, succès, panne).
  send(body: unknown) {
    this.sent = body;
  }

  progress(init: ProgressInit) {
    this.upload.onprogress?.(init);
  }

  succeed(body: string, status = 200) {
    this.status = status;
    this.responseText = body;
    this.onload?.();
  }
}

function stubXhr() {
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  return () => {
    const xhr = FakeXhr.last;
    if (!xhr) throw new Error('XMLHttpRequest jamais construit');
    return xhr;
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeXhr.last = null;
});

function upload(onProgress?: (p: UploadProgress) => void) {
  return uploadWithProgress<{ storageId: string }>({
    url: 'https://exemple.convex.cloud/api/storage/upload?token=x',
    file: new Blob(['%PDF-1.4']),
    contentType: 'application/pdf',
    onProgress,
  });
}

describe('Téléversement — progression', () => {
  it('rapporte un pourcentage quand la taille totale est connue', async () => {
    const current = stubXhr();
    const seen: UploadProgress[] = [];
    const done = upload((p) => seen.push(p));

    current().progress({ loaded: 250, total: 1000, lengthComputable: true });
    current().progress({ loaded: 1000, total: 1000, lengthComputable: true });
    current().succeed('{"storageId":"kg123"}');
    await done;

    expect(seen.map((p) => p.percent)).toEqual([25, 100]);
    expect(seen[0]).toEqual({ loaded: 250, total: 1000, percent: 25 });
  });

  it('rend un pourcentage indéterminé quand la taille est inconnue', async () => {
    const current = stubXhr();
    const seen: UploadProgress[] = [];
    const done = upload((p) => seen.push(p));

    // `lengthComputable` faux : inventer un pourcentage serait mentir sur
    // l'avancement — l'interface doit pouvoir montrer une barre indéterminée.
    current().progress({ loaded: 4096, total: 0, lengthComputable: false });
    current().succeed('{"storageId":"kg123"}');
    await done;

    expect(seen).toEqual([{ loaded: 4096, total: null, percent: null }]);
  });

  it('ne dépasse jamais 100 %', async () => {
    const current = stubXhr();
    const seen: UploadProgress[] = [];
    const done = upload((p) => seen.push(p));

    current().progress({ loaded: 1200, total: 1000, lengthComputable: true });
    current().succeed('{"storageId":"kg123"}');
    await done;

    expect(seen[0].percent).toBe(100);
  });
});

describe('Téléversement — requête et réponse', () => {
  it('poste le fichier avec son type de contenu', async () => {
    const current = stubXhr();
    const done = upload();
    const xhr = current();

    expect(xhr.method).toBe('POST');
    expect(xhr.url).toContain('/api/storage/upload');
    expect(xhr.headers['Content-Type']).toBe('application/pdf');
    expect(xhr.sent).toBeInstanceOf(Blob);

    xhr.succeed('{"storageId":"kg123"}');
    await expect(done).resolves.toEqual({ storageId: 'kg123' });
  });

  it('échoue sur un statut non 2xx', async () => {
    const current = stubXhr();
    const done = upload();
    current().succeed('nope', 500);
    await expect(done).rejects.toThrow(UPLOAD_FAILED);
  });

  it('échoue sur une réponse illisible', async () => {
    const current = stubXhr();
    const done = upload();
    current().succeed('<html>proxy</html>');
    await expect(done).rejects.toThrow(UPLOAD_FAILED);
  });

  it('échoue sur une panne réseau', async () => {
    const current = stubXhr();
    const done = upload();
    current().onerror?.();
    await expect(done).rejects.toThrow(UPLOAD_FAILED);
  });

  it('échoue sur un délai dépassé', async () => {
    const current = stubXhr();
    const done = upload();
    current().ontimeout?.();
    await expect(done).rejects.toThrow(UPLOAD_FAILED);
  });
});
