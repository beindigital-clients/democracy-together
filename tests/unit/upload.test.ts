import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  UPLOAD_FAILED,
  uploadWithProgress,
  type UploadProgress,
} from '@/lib/upload';

// UPLOAD WITH PROGRESS (issue #37).
//
// What these tests hold: progress is indeed READ from `upload`, the
// response is returned as is, and every failure — status, network, unreadable
// response — reaches the caller in the same shape, the one it knows how to translate
// into "réessayez".
//
// The module's real purpose cannot be verified otherwise: `fetch`
// does not expose upload progress. So we simulate XMLHttpRequest, the only
// API that exposes it, and put our wiring of it to the test.

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

  // Sending resolves nothing by itself: each test plays out the sequence it wants
  // to test (progress, success, failure).
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

    // `lengthComputable` false: inventing a percentage would be lying about
    // progress — the interface must be able to show an indeterminate bar.
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
