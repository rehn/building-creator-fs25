// Photos for the template wizard, made smaller in the browser before they're sent.

/** Claude reads images up to about this many pixels on the long side; bigger only costs time. */
export const PHOTO_MAX_SIDE = 1568;

/** A photo as a JPEG at most PHOTO_MAX_SIDE on its long side, turned the way the camera held it. */
export async function shrinkPhoto(file: File, max = PHOTO_MAX_SIDE): Promise<Blob> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`Couldn’t read “${file.name}”. Use a JPEG, PNG or WebP photo.`);
  }
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * s));
  c.height = Math.max(1, Math.round(bmp.height * s));
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return new Promise((resolve, reject) =>
    c.toBlob(b => (b ? resolve(b) : reject(new Error(`Couldn’t shrink “${file.name}”.`))), "image/jpeg", 0.85));
}
