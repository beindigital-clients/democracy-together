// RECADRAGE CARRÉ D'UNE PHOTO DE PROFIL, côté navigateur (facultatif).
//
// Le serveur n'exige pas un carré — il vérifie le type, la taille et le
// contenu réel (convex/social/profiles.ts#setPhoto). Le recadrage sert
// l'affichage (pastilles rondes) ET le faible débit : une photo de téléphone
// de 4 000 px est ramenée à 512 px avant de partir, ce qui divise l'envoi par
// dix sur une connexion lente.
//
// La GÉOMÉTRIE est une fonction pure (testée dans tests/unit) ; le dessin,
// qui demande un canvas, n'en est que l'application.

export const CROP_OUTPUT_SIZE = 512;

export type CropRect = {
  sx: number;
  sy: number;
  side: number;
  out: number;
};

/** Carré centré le plus grand possible, et taille de sortie (sans agrandir). */
export function centeredSquare(width: number, height: number): CropRect {
  const side = Math.max(1, Math.floor(Math.min(width, height)));
  return {
    sx: Math.floor((width - side) / 2),
    sy: Math.floor((height - side) / 2),
    side,
    out: Math.min(side, CROP_OUTPUT_SIZE),
  };
}

/**
 * Recadre une image en carré centré et la réencode en JPEG. Rend `null` si le
 * navigateur ne sait pas décoder le fichier : l'appelant envoie alors
 * l'original, que le serveur jugera.
 */
export async function cropToSquare(file: Blob): Promise<Blob | null> {
  if (typeof createImageBitmap !== 'function') return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  const { sx, sy, side, out } = centeredSquare(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // Fond blanc : le JPEG n'a pas de transparence, et un PNG détouré
  // deviendrait noir.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out, out);
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out);
  bitmap.close();
  return await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.88),
  );
}
