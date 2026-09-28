// SQUARE CROPPING OF A PROFILE PHOTO, browser-side (optional).
//
// The server doesn't require a square — it checks the type, size and
// actual content (convex/social/profiles.ts#setPhoto). Cropping serves
// display (round badges) AND low bandwidth: a 4,000 px phone photo
// is scaled down to 512 px before it's sent, which cuts the upload by a factor of
// ten on a slow connection.
//
// The GEOMETRY is a pure function (tested in tests/unit); the drawing,
// which needs a canvas, is merely its application.

export const CROP_OUTPUT_SIZE = 512;

export type CropRect = {
  sx: number;
  sy: number;
  side: number;
  out: number;
};

/** Largest possible centred square, and output size (without upscaling). */
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
 * Crops an image to a centred square and re-encodes it as JPEG. Returns `null` if the
 * browser cannot decode the file: the caller then sends
 * the original, which the server will judge.
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
  // White background: JPEG has no transparency, and a cut-out PNG
  // would turn black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out, out);
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out);
  bitmap.close();
  return await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.88),
  );
}
