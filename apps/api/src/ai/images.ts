import sharp from 'sharp';

/**
 * Longest edge of images sent to the model. The 512 px thumbnail is too small to
 * see pests or leaf spots; the 2048 px original costs more without helping.
 */
const MODEL_IMAGE_EDGE = 1024;

/** Re-encodes a stored photo for the model and returns it as a data URL. Stored photos have no EXIF/GPS. */
export async function toModelImage(photo: Buffer): Promise<string> {
  const jpeg = await sharp(photo)
    .resize({ width: MODEL_IMAGE_EDGE, height: MODEL_IMAGE_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
}
