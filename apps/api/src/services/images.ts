import sharp from 'sharp';
import { ApiError } from '../middleware/errors';

/** Longest edge of stored photos, in pixels. Plenty for phone and desktop screens. */
const MAX_EDGE = 2048;
const JPEG_QUALITY = 82;

/** ISO-BMFF brands used by HEIC/HEIF photos (the iPhone camera's default format). */
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs']);

function isHeic(data: Buffer): boolean {
  return data.length >= 12 && data.toString('latin1', 4, 8) === 'ftyp' && HEIC_BRANDS.has(data.toString('latin1', 8, 12));
}

/**
 * Normalizes an uploaded image: applies EXIF rotation, downsizes large photos,
 * re-encodes as JPEG and strips all metadata (including GPS location).
 */
export async function processImage(data: Buffer): Promise<Buffer> {
  if (isHeic(data)) {
    throw new ApiError(
      415,
      'unsupported_image_format',
      'HEIC images are not supported. Upload a JPEG or PNG instead — choosing the photo through the iPhone photo picker usually converts it automatically.',
    );
  }
  try {
    return await sharp(data, { limitInputPixels: 100_000_000 })
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new ApiError(
      415,
      'unsupported_image_format',
      'The file is not a supported image. Use JPEG, PNG, WebP, GIF or AVIF.',
    );
  }
}
