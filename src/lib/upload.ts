// TÉLÉVERSEMENT AVEC PROGRESSION (issue #37)
//
// `fetch` n'expose PAS la progression d'ENVOI : son corps sortant n'est pas
// observable (seule la RÉCEPTION l'est, via le flux de la réponse). Pour dire à
// quelqu'un où en est l'envoi de son PDF de 20 Mo, il n'existe qu'une voie dans
// le navigateur — `XMLHttpRequest.upload.onprogress`. C'est la seule raison
// pour laquelle ce module existe : ailleurs, le projet appelle `fetch`.
//
// Sans ce retour, un envoi de plusieurs minutes sur une connexion à faible
// débit — l'hypothèse centrale du projet — est indiscernable d'un blocage.

// Message porté par l'erreur en cas d'échec, quelle qu'en soit la cause (réseau
// coupé, statut non 2xx, réponse illisible). L'appelant n'a pas à distinguer :
// il n'y a qu'une chose à proposer, réessayer.
export const UPLOAD_FAILED = 'upload-failed';

export type UploadProgress = {
  loaded: number;
  // `null` quand la taille totale est inconnue (`lengthComputable` faux) :
  // l'interface doit alors montrer une progression indéterminée plutôt qu'un
  // pourcentage inventé.
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
