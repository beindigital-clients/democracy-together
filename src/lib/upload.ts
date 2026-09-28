// UPLOAD WITH PROGRESS (issue #37)
//
// `fetch` does NOT expose UPLOAD progress: its outgoing body is not
// observable (only DOWNLOAD is, through the response stream). To tell
// someone how far along the upload of their 20 MB PDF is, there is only one
// way in the browser — `XMLHttpRequest.upload.onprogress`. That is the only
// reason this module exists: elsewhere, the project calls `fetch`.
//
// Without this feedback, an upload lasting several minutes on a low-bandwidth
// connection — the project's central assumption — is indistinguishable from a hang.

// Message carried by the error on failure, whatever the cause (network
// down, non-2xx status, unreadable response). The caller does not need to
// distinguish: there is only one thing to offer, retrying.
export const UPLOAD_FAILED = 'upload-failed';

export type UploadProgress = {
  loaded: number;
  // `null` when the total size is unknown (`lengthComputable` false):
  // the UI must then show indeterminate progress rather than an
  // invented percentage.
  total: number | null;
  percent: number | null;
};

export function uploadWithProgress<T>({
  url,
  file,
  contentType,
  onProgress,
}: {
  url: string;
  file: Blob;
  contentType: string;
  onProgress?: (progress: UploadProgress) => void;
}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const failed = () => reject(new Error(UPLOAD_FAILED));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', contentType);

    xhr.upload.onprogress = (event: ProgressEvent) => {
      if (!onProgress) return;
      const total = event.lengthComputable ? event.total : null;
      onProgress({
        loaded: event.loaded,
        total,
        percent:
          total && total > 0
            ? Math.min(100, Math.round((event.loaded / total) * 100))
            : null,
      });
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) return failed();
      try {
        resolve(JSON.parse(xhr.responseText) as T);
      } catch {
        failed();
      }
    };
    xhr.onerror = failed;
    xhr.ontimeout = failed;
    xhr.onabort = failed;

    xhr.send(file);
  });
}
