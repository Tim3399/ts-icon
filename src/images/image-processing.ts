import sharp from 'sharp';

/**
 * The buffer sharp was handed does not decode as a real image at all, or it
 * decoded to a format this system isn't willing to accept. This is the
 * actual security boundary for "is this really an image of the type it
 * claims to be" -- unlike a client-supplied MIME type string or a fetched
 * `Content-Type` header, sharp's own detected `format` comes from actually
 * parsing the file's bytes.
 */
export class InvalidImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidImageError';
  }
}

/**
 * The buffer decoded fine and is a real image of an accepted format, but its
 * dimensions (or total pixel count) exceed what this system will ever
 * legitimately need to store. Kept distinct from `InvalidImageError` because
 * "not an image" and "an image that decodes to something absurdly large"
 * call for different HTTP semantics -- see the mapping to status codes at
 * the call sites.
 */
export class ImageTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageTooLargeError';
  }
}

// The fixed banner size every stored image is normalized to, regardless of
// the source image's own dimensions or aspect ratio.
export const TARGET_WIDTH = 500;
export const TARGET_HEIGHT = 44;

// Formats sharp is willing to fully decode and re-encode for us. This is the
// allowlist that actually matters (checked against sharp's own detected
// `format`, not any client-supplied string) -- a cheap MIME-type-string
// pre-check may still happen earlier as a fast rejection, but it is not the
// security boundary.
const ACCEPTED_FORMATS = new Set(['png', 'jpeg', 'webp', 'gif']);

// Dimension ceiling, checked against `sharp(...).metadata()` alone -- which
// reads only the file's header fields for every format accepted here and
// never decodes the full raster -- before any expensive resize/re-encode
// pipeline runs. This is what stops a small, highly-compressed file that
// *decodes* to an enormous bitmap (a decompression-bomb shape) from causing
// unbounded memory/CPU use: rejection happens before the full decode, not
// after. 8000px per side is far beyond anything a browser-side crop tool
// would ever produce for a 500x44 banner, and the 25-megapixel total-pixel
// cap (roughly a high-end consumer camera photo) additionally catches images
// that stay under the per-side cap but are still absurdly large in area
// (e.g. a very wide-but-not-tall image).
const MAX_DIMENSION_PX = 8000;
const MAX_PIXELS = 25_000_000;

// Canonical output format: PNG. Lossless (no re-compression artifacts on top
// of whatever the source already had), supports transparency (some banner
// source images have transparent backgrounds), and universally supported by
// browsers. File size is not a meaningful concern here -- a 500x44 PNG is a
// few KB at most -- so PNG's usual "larger than JPEG" downside doesn't
// apply. This is also the mime type persisted alongside the image and
// returned as the `Content-Type` on read, replacing whatever the client or
// the fetched URL originally claimed.
export const OUTPUT_MIME_TYPE = 'image/png';

export interface ProcessedImage {
  buffer: Buffer;
  mimeType: string;
}

/**
 * Validates and normalizes an arbitrary, untrusted image buffer for
 * storage: confirms it actually decodes as an accepted image format
 * (ignoring whatever type the caller claims), rejects anything with
 * unreasonable dimensions before doing expensive work, auto-orients from
 * EXIF and bakes that into the pixels, strips all other metadata, and
 * resizes/re-encodes to the fixed canonical banner size and format.
 *
 * Animated GIF policy: multi-frame/animated input is deliberately reduced to
 * a single static frame. This system has no concept of an animated banner
 * anywhere else (the crop tool, the preview, and the fixed 500x44 target are
 * all single-static-image concepts), so there is nothing downstream that
 * could ever make use of extra frames. Sharp's default behavior (i.e. never
 * passing `{ animated: true }` to the `sharp()` constructor) already reads
 * and processes only the first frame/page of a multi-frame input -- verified
 * directly against the installed sharp version by round-tripping a
 * hand-built 3-frame GIF through this exact code path and confirming the
 * output contains a single frame at the target dimensions, not three. This
 * function relies on that default rather than opting into animated mode, so
 * no special-case frame-stripping code is needed.
 */
export async function processImageForStorage(
  input: Buffer,
): Promise<ProcessedImage> {
  let metadata;
  try {
    // `sharp()`'s constructor can throw synchronously (e.g. on an empty
    // buffer) in addition to `.metadata()` rejecting asynchronously for a
    // buffer that doesn't decode -- both are handled the same way here.
    metadata = await sharp(input).metadata();
  } catch {
    throw new InvalidImageError('The file could not be decoded as an image');
  }

  const { format, width, height } = metadata;
  if (!format || !ACCEPTED_FORMATS.has(format)) {
    throw new InvalidImageError(
      `Unsupported or unrecognized image format: ${format ?? 'unknown'}`,
    );
  }
  if (!width || !height) {
    throw new InvalidImageError('Image is missing width/height metadata');
  }
  if (
    width > MAX_DIMENSION_PX ||
    height > MAX_DIMENSION_PX ||
    width * height > MAX_PIXELS
  ) {
    throw new ImageTooLargeError(
      `Image dimensions ${width}x${height} exceed the maximum allowed size`,
    );
  }

  try {
    const buffer = await sharp(input)
      // Auto-orients from EXIF orientation metadata and bakes the rotation
      // into the actual pixels. Must run before the metadata-stripping
      // re-encode below, or a sideways/upside-down source (common from
      // phone cameras, especially via the URL-import path) would come out
      // sideways/upside-down once the orientation tag itself is gone.
      .rotate()
      // Center-crop to fill the exact target size rather than distorting
      // the aspect ratio or leaving letterboxed padding -- a deliberate
      // product decision: a source image with a very different aspect
      // ratio (most relevant for the URL-import path, which has no
      // client-side cropping step at all) has its edges cropped away, not
      // its content squished.
      .resize(TARGET_WIDTH, TARGET_HEIGHT, { fit: 'cover', position: 'centre' })
      // No `.withMetadata()` call: sharp does not carry source metadata
      // (EXIF, ICC profiles, etc.) into the re-encoded output by default,
      // so this also strips everything else besides orientation, which was
      // already baked into the pixels above.
      .png()
      .toBuffer();
    return { buffer, mimeType: OUTPUT_MIME_TYPE };
  } catch {
    // Passed the cheap metadata-only check above but failed during the
    // actual decode/resize pipeline (e.g. a truncated/corrupt body past the
    // header) -- still an "not a valid image we can use" case, not a server
    // error.
    throw new InvalidImageError('The image could not be processed');
  }
}
