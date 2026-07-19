import sharp from 'sharp';
import {
  processImageForStorage,
  InvalidImageError,
  ImageTooLargeError,
  OUTPUT_MIME_TYPE,
  TARGET_WIDTH,
  TARGET_HEIGHT,
} from './image-processing';

// Small helper fixtures, generated with sharp itself rather than committing
// binary test files -- keeps the test self-contained and independent of any
// externally-fetched sample image.
function solidColorImage(
  width: number,
  height: number,
  format: 'png' | 'jpeg' | 'webp' = 'png',
  color: { r: number; g: number; b: number } = { r: 10, g: 120, b: 200 },
): Promise<Buffer> {
  const img = sharp({
    create: { width, height, channels: 3, background: color },
  });
  if (format === 'jpeg') return img.jpeg().toBuffer();
  if (format === 'webp') return img.webp().toBuffer();
  return img.png().toBuffer();
}

async function multiFrameGif(frameCount: number): Promise<Buffer> {
  const colors = [
    { r: 255, g: 0, b: 0 },
    { r: 0, g: 255, b: 0 },
    { r: 0, g: 0, b: 255 },
    { r: 255, g: 255, b: 0 },
  ];
  const frames = await Promise.all(
    Array.from({ length: frameCount }, (_, i) =>
      solidColorImage(20, 20, 'png', colors[i % colors.length]),
    ),
  );
  return sharp(frames, { join: { animated: true } })
    .gif()
    .toBuffer();
}

describe('processImageForStorage', () => {
  it('resizes a valid image to exactly the target size and re-encodes to the canonical format', async () => {
    const input = await solidColorImage(1200, 300, 'jpeg');
    const result = await processImageForStorage(input);

    expect(result.mimeType).toBe(OUTPUT_MIME_TYPE);

    const outputMeta = await sharp(result.buffer).metadata();
    expect(outputMeta.format).toBe('png');
    expect(outputMeta.width).toBe(TARGET_WIDTH);
    expect(outputMeta.height).toBe(TARGET_HEIGHT);
  });

  it('center-crops rather than distorting a very different aspect ratio', async () => {
    // A tall, narrow source (very different from the 500x44 banner shape) --
    // 'cover' + 'centre' should crop the edges, never squish the content.
    const input = await solidColorImage(100, 800, 'png');
    const result = await processImageForStorage(input);
    const outputMeta = await sharp(result.buffer).metadata();
    expect(outputMeta.width).toBe(TARGET_WIDTH);
    expect(outputMeta.height).toBe(TARGET_HEIGHT);
  });

  it('rejects a corrupt/non-image buffer with InvalidImageError', async () => {
    const notAnImage = Buffer.from(
      'this is definitely not image data, just some plain text bytes padded out further',
    );
    await expect(processImageForStorage(notAnImage)).rejects.toBeInstanceOf(
      InvalidImageError,
    );
  });

  it('rejects an empty buffer with InvalidImageError', async () => {
    await expect(
      processImageForStorage(Buffer.alloc(0)),
    ).rejects.toBeInstanceOf(InvalidImageError);
  });

  it('rejects an image whose single dimension exceeds the max before a full decode', async () => {
    // Cheap to construct (a solid color compresses to a tiny file) but has
    // an oversized declared width -- exercises the per-side dimension cap.
    const input = await solidColorImage(9000, 40, 'png');
    await expect(processImageForStorage(input)).rejects.toBeInstanceOf(
      ImageTooLargeError,
    );
  });

  it('rejects an image whose total pixel count exceeds the max even though neither side alone does', async () => {
    // 6000x6000 stays under the 8000px-per-side cap but is 36 megapixels,
    // over the 25-megapixel total-pixel cap.
    const input = await solidColorImage(6000, 6000, 'png');
    await expect(processImageForStorage(input)).rejects.toBeInstanceOf(
      ImageTooLargeError,
    );
  });

  it('rejects before running the expensive resize/re-encode pipeline on an oversized image', async () => {
    // Not a strict timing assertion (too flaky across machines/CI), but a
    // sanity check that rejection is fast -- consistent with the dimension
    // check running off metadata alone rather than after a full decode.
    const input = await solidColorImage(9000, 9000, 'png');
    const start = Date.now();
    await expect(processImageForStorage(input)).rejects.toBeInstanceOf(
      ImageTooLargeError,
    );
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it('reduces a multi-frame animated GIF to a single static frame in the output', async () => {
    const animated = await multiFrameGif(3);
    // Confirm the fixture itself is genuinely multi-frame before asserting
    // anything about our own code's behavior.
    const sourceMeta = await sharp(animated, { animated: true }).metadata();
    expect(sourceMeta.pages).toBe(3);

    const result = await processImageForStorage(animated);
    const outputMeta = await sharp(result.buffer, {
      animated: true,
    }).metadata();
    expect(outputMeta.pages ?? 1).toBe(1);
    expect(outputMeta.width).toBe(TARGET_WIDTH);
    expect(outputMeta.height).toBe(TARGET_HEIGHT);
    expect(result.mimeType).toBe(OUTPUT_MIME_TYPE);
  });

  it('strips metadata from the output (no EXIF/orientation survives)', async () => {
    const input = await solidColorImage(300, 60, 'jpeg');
    const result = await processImageForStorage(input);
    const outputMeta = await sharp(result.buffer).metadata();
    expect(outputMeta.orientation).toBeUndefined();
    expect(outputMeta.exif).toBeUndefined();
  });

  it('rejects an unrecognized/unsupported format even if it otherwise decodes', async () => {
    // sharp can decode SVG, but it is not in this module's accepted raster
    // format allowlist.
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>',
    );
    await expect(processImageForStorage(svg)).rejects.toBeInstanceOf(
      InvalidImageError,
    );
  });
});
