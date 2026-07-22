import sharp, { type OutputInfo } from 'sharp';
import {
  TARGET_WIDTH,
  TARGET_HEIGHT,
  InvalidImageError,
  ImageTooLargeError,
} from './image-processing';

// The horizontal pixel shift applied per nesting-depth level, so a deeply
// nested channel's banner slice is drawn from further right in the source
// image -- keeping the artwork visually continuous despite the TeamSpeak
// client indenting each nesting level. This number itself (11px) is not
// derived from this codebase; it's carried over from observing the intended
// behavior of a reference tool built for a different (TS5) client version,
// and is flagged for re-confirmation against a real TS6 client (see the
// implementation plan's verification section) the same way TARGET_HEIGHT
// already is.
export const CHANNEL_DEPTH_OFFSET_PX = 11;

// Safety ceiling on how many channels a single generation run can produce.
// Row count is otherwise auto-computed purely from the uploaded image's
// height, so without this cap a pathologically tall source image could make
// one admin action spawn an unbounded number of channels.
export const MAX_WALLPAPER_ROWS = 300;

// A wallpaper source image can legitimately be dozens of rows tall (up to
// MAX_WALLPAPER_ROWS * TARGET_HEIGHT = 13,200px at the narrowest, more once
// depth-offset padding is added to the width), so this ceiling is
// deliberately much more generous than image-processing.ts's
// MAX_DIMENSION_PX/MAX_PIXELS (which target a single 500x44 banner) --
// while still bounded, so a decompression-bomb-shaped file can't force an
// unbounded decode.
const MAX_SOURCE_DIMENSION_PX = 20_000;
const MAX_SOURCE_PIXELS = 60_000_000;

const ACCEPTED_FORMATS = new Set(['png', 'jpeg', 'webp', 'gif']);

export interface WallpaperRow {
  depth: number;
  isSpacer: boolean;
}

/**
 * Generates up to `maxRows` candidate rows alternating art/spacer
 * (art, spacer, art, spacer, ...), per the chosen preset. `sliceWallpaper()`
 * truncates this down to however many rows the uploaded image's height
 * actually supports -- this just produces the (over-generous) candidate
 * sequence to truncate from.
 *
 * - 'flat': every row, art and spacer alike, at depth 0 -- siblings of the
 *   chosen parent channel.
 * - 'nested-spacer': art rows stay at depth 0; each spacer is a child of the
 *   art channel immediately before it (depth 1) -- a common real-world
 *   technique (the spacer visually collapses into its channel) that needs
 *   CHANNEL_DEPTH_OFFSET_PX compensation to keep the artwork aligned despite
 *   the extra indentation.
 */
export function buildAlternatingRowPlan(
  maxRows: number,
  mode: 'flat' | 'nested-spacer',
): WallpaperRow[] {
  const rows: WallpaperRow[] = [];
  for (let i = 0; i < maxRows; i++) {
    const isSpacer = i % 2 === 1;
    const depth = mode === 'nested-spacer' && isSpacer ? 1 : 0;
    rows.push({ depth, isSpacer });
  }
  return rows;
}

export interface WallpaperBackgroundColor {
  r: number;
  g: number;
  b: number;
  /** 0-255, matching the byte range of every other channel here -- converted
   * to sharp's own 0-1 alpha scale internally, so callers never need to know
   * about that mismatch. */
  alpha: number;
}

export interface WallpaperSliceOptions {
  xOffset?: number;
  yOffset?: number;
  backgroundColor?: WallpaperBackgroundColor;
  /** Default true. */
  coverFitMode?: boolean;
}

export interface WallpaperSlice {
  row: WallpaperRow;
  image: Buffer;
}

const DEFAULT_BACKGROUND: WallpaperBackgroundColor = {
  r: 0,
  g: 0,
  b: 0,
  alpha: 0,
};

/**
 * Slices one large source image into a sequence of TARGET_WIDTH x
 * TARGET_HEIGHT row images, one per channel, so that stacking them
 * top-to-bottom in the channel tree (accounting for each row's nesting
 * depth) reproduces a continuous "wallpaper" image.
 *
 * The row count is not `candidateRows.length` -- it's truncated to however
 * many whole TARGET_HEIGHT-tall rows actually fit within the resized
 * image's real height, so a short source image doesn't get padded with
 * blank trailing rows and a tall one doesn't get cut off mid-row.
 */
export async function sliceWallpaper(
  input: Buffer,
  candidateRows: WallpaperRow[],
  options: WallpaperSliceOptions = {},
): Promise<WallpaperSlice[]> {
  let metadata;
  try {
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
    width > MAX_SOURCE_DIMENSION_PX ||
    height > MAX_SOURCE_DIMENSION_PX ||
    width * height > MAX_SOURCE_PIXELS
  ) {
    throw new ImageTooLargeError(
      `Image dimensions ${width}x${height} exceed the maximum allowed size`,
    );
  }

  const coverFitMode = options.coverFitMode !== false;
  const xOffset = options.xOffset ?? 0;
  const yOffset = options.yOffset ?? 0;
  const backgroundColor = options.backgroundColor ?? DEFAULT_BACKGROUND;
  // sharp's `create.background` alpha is a 0-1 float (via the `color`
  // module it delegates to), not the 0-255 byte range this module's own
  // WallpaperBackgroundColor uses for every other channel -- confirmed
  // directly against the installed sharp version, since passing a raw
  // 0-255 value through unconverted would silently clamp any alpha above 1
  // to fully opaque instead of the intended partial transparency.
  const background = {
    r: backgroundColor.r,
    g: backgroundColor.g,
    b: backgroundColor.b,
    alpha: backgroundColor.alpha / 255,
  };

  const maxDepth = Math.max(0, ...candidateRows.map((r) => r.depth));
  const targetWidth = coverFitMode
    ? TARGET_WIDTH + maxDepth * CHANNEL_DEPTH_OFFSET_PX
    : TARGET_WIDTH;

  let resized: { data: Buffer; info: OutputInfo };
  try {
    resized = await sharp(input)
      .rotate()
      .resize({ width: targetWidth })
      .ensureAlpha()
      .png()
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new InvalidImageError('The image could not be processed');
  }

  const resizedHeight = resized.info.height;

  const rowsToRender: WallpaperRow[] = [];
  let remainingHeight = resizedHeight;
  for (const row of candidateRows) {
    if (remainingHeight - TARGET_HEIGHT < 0) break;
    remainingHeight -= TARGET_HEIGHT;
    rowsToRender.push(row);
  }

  const slices: WallpaperSlice[] = [];
  let y = 0;
  for (const row of rowsToRender) {
    const x = row.depth * CHANNEL_DEPTH_OFFSET_PX - xOffset;
    const rowY = y + yOffset;

    // sharp's composite() requires the input to be no larger than the
    // canvas it's composited onto, in both dimensions, regardless of
    // position -- unlike Canvas 2D's drawImage, it has no built-in
    // tolerance for a source rectangle that runs past the source image's
    // edges (a deep row's x-offset can easily push its 500px-wide window
    // past the resized image's right edge). So the desired
    // TARGET_WIDTH x TARGET_HEIGHT window is first clamped to whatever
    // actually overlaps the resized source, that (guaranteed in-bounds,
    // guaranteed canvas-sized-or-smaller) region is extracted on its own,
    // and only that piece is composited onto the blank, background-filled
    // canvas at the equivalent relative position -- reproducing the same
    // "background shows through wherever the source didn't reach" result.
    const clampedX = Math.max(0, x);
    const clampedY = Math.max(0, rowY);
    const clampedRight = Math.min(x + TARGET_WIDTH, resized.info.width);
    const clampedBottom = Math.min(rowY + TARGET_HEIGHT, resizedHeight);
    const extractWidth = clampedRight - clampedX;
    const extractHeight = clampedBottom - clampedY;

    let canvas = sharp({
      create: {
        width: TARGET_WIDTH,
        height: TARGET_HEIGHT,
        channels: 4,
        background,
      },
    });

    if (extractWidth > 0 && extractHeight > 0) {
      const extracted = await sharp(resized.data)
        .extract({
          left: clampedX,
          top: clampedY,
          width: extractWidth,
          height: extractHeight,
        })
        .toBuffer();
      canvas = canvas.composite([
        {
          input: extracted,
          left: clampedX - x,
          top: clampedY - rowY,
        },
      ]);
    }
    // If there's no overlap at all (extractWidth/extractHeight <= 0 --
    // the requested window is entirely outside the resized source), the
    // row is just the plain background-filled canvas with nothing
    // composited onto it.

    const image = await canvas.png().toBuffer();
    slices.push({ row, image });
    y += TARGET_HEIGHT;
  }

  return slices;
}
