import sharp from 'sharp';
import {
  sliceWallpaper,
  buildAlternatingRowPlan,
  CHANNEL_DEPTH_OFFSET_PX,
  MAX_WALLPAPER_ROWS,
  type WallpaperRow,
} from './wallpaper-slicer';
import {
  InvalidImageError,
  ImageTooLargeError,
  TARGET_WIDTH,
  TARGET_HEIGHT,
} from './image-processing';

// Builds a source image made of N horizontal, TARGET_HEIGHT-tall bands, each
// a distinct solid color -- lets pixel assertions confirm exactly which
// band of the source ended up in which sliced row, the same style as
// image-processing.spec.ts's real (non-mocked) sharp round-trips.
async function stripedImage(
  width: number,
  bandColors: { r: number; g: number; b: number }[],
  bandHeight: number = TARGET_HEIGHT,
): Promise<Buffer> {
  const composites = bandColors.map((color, i) => ({
    input: {
      create: {
        width,
        height: bandHeight,
        channels: 3 as const,
        background: color,
      },
    },
    top: i * bandHeight,
    left: 0,
  }));
  return sharp({
    create: {
      width,
      height: bandColors.length * bandHeight,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

async function pixelAt(image: Buffer, x: number, y: number) {
  const { data, info } = await sharp(image)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const idx = (y * info.width + x) * info.channels;
  return {
    r: data[idx],
    g: data[idx + 1],
    b: data[idx + 2],
    a: info.channels === 4 ? data[idx + 3] : 255,
  };
}

const RED = { r: 255, g: 0, b: 0 };
const GREEN = { r: 0, g: 255, b: 0 };
const BLUE = { r: 0, g: 0, b: 255 };
const YELLOW = { r: 255, g: 255, b: 0 };

describe('buildAlternatingRowPlan', () => {
  it('produces exactly maxRows rows', () => {
    expect(buildAlternatingRowPlan(5, 'flat')).toHaveLength(5);
    expect(buildAlternatingRowPlan(0, 'flat')).toHaveLength(0);
  });

  it('flat mode: every row (art and spacer) is at depth 0', () => {
    const rows = buildAlternatingRowPlan(6, 'flat');
    expect(rows.every((r) => r.depth === 0)).toBe(true);
    expect(rows.map((r) => r.isSpacer)).toEqual([
      false,
      true,
      false,
      true,
      false,
      true,
    ]);
  });

  it('nested-spacer mode: art rows stay at depth 0, spacers are at depth 1', () => {
    const rows = buildAlternatingRowPlan(4, 'nested-spacer');
    expect(rows).toEqual<WallpaperRow[]>([
      { depth: 0, isSpacer: false },
      { depth: 1, isSpacer: true },
      { depth: 0, isSpacer: false },
      { depth: 1, isSpacer: true },
    ]);
  });

  it('MAX_WALLPAPER_ROWS is a positive, finite safety ceiling', () => {
    expect(MAX_WALLPAPER_ROWS).toBeGreaterThan(0);
    expect(Number.isFinite(MAX_WALLPAPER_ROWS)).toBe(true);
  });
});

describe('sliceWallpaper', () => {
  it('truncates to exactly the rows that fit, never padding a partial trailing row', async () => {
    // 3 full bands + a 20px partial band that doesn't make a 4th full row.
    const input = await stripedImage(TARGET_WIDTH, [RED, GREEN, BLUE]);
    const shortImage = await sharp(input)
      .resize({ width: TARGET_WIDTH, height: 3 * TARGET_HEIGHT + 20 })
      .png()
      .toBuffer();

    const candidateRows = buildAlternatingRowPlan(10, 'flat');
    const slices = await sliceWallpaper(shortImage, candidateRows);

    expect(slices).toHaveLength(3);
  });

  it('produces zero rows for an image shorter than a single row', async () => {
    const input = await stripedImage(TARGET_WIDTH, [RED]);
    const tinyImage = await sharp(input)
      .resize({ width: TARGET_WIDTH, height: 10 })
      .png()
      .toBuffer();

    const slices = await sliceWallpaper(
      tinyImage,
      buildAlternatingRowPlan(5, 'flat'),
    );
    expect(slices).toHaveLength(0);
  });

  it('each output row samples the correct band of the source (flat mode, no depth offset)', async () => {
    const input = await stripedImage(TARGET_WIDTH, [RED, GREEN, BLUE, YELLOW]);
    const rows = buildAlternatingRowPlan(4, 'flat');

    const slices = await sliceWallpaper(input, rows, { coverFitMode: false });

    expect(slices).toHaveLength(4);
    const expectedColors = [RED, GREEN, BLUE, YELLOW];
    for (let i = 0; i < slices.length; i++) {
      const px = await pixelAt(slices[i].image, 10, 10);
      expect(px).toEqual({ ...expectedColors[i], a: 255 });
    }
  });

  it('applies the CHANNEL_DEPTH_OFFSET_PX horizontal shift for a nested (depth > 0) row', async () => {
    // Each band's left CHANNEL_DEPTH_OFFSET_PX columns are RED, the rest
    // GREEN, so a depth-1 row (shifted right by the offset) should sample
    // GREEN starting from column 0, while a depth-0 row would still see the
    // RED strip at column 0.
    const width = TARGET_WIDTH + CHANNEL_DEPTH_OFFSET_PX;
    const band = sharp({
      create: { width, height: TARGET_HEIGHT, channels: 3, background: GREEN },
    }).composite([
      {
        input: {
          create: {
            width: CHANNEL_DEPTH_OFFSET_PX,
            height: TARGET_HEIGHT,
            channels: 3,
            background: RED,
          },
        },
        left: 0,
        top: 0,
      },
    ]);
    const bandBuffer = await band.png().toBuffer();
    const image = await sharp({
      create: {
        width,
        height: TARGET_HEIGHT * 2,
        channels: 3,
        background: RED,
      },
    })
      .composite([
        { input: bandBuffer, left: 0, top: 0 },
        { input: bandBuffer, left: 0, top: TARGET_HEIGHT },
      ])
      .png()
      .toBuffer();

    const rows: WallpaperRow[] = [
      { depth: 0, isSpacer: false },
      { depth: 1, isSpacer: true },
    ];
    // coverFitMode stays at its default (true): maxDepth is 1, so the
    // pre-resize target width is exactly TARGET_WIDTH + CHANNEL_DEPTH_OFFSET_PX
    // -- the same width this fixture image was already built at, so the
    // resize step is a no-op and the hand-placed RED/GREEN columns land
    // exactly where expected.
    const slices = await sliceWallpaper(image, rows);

    expect(slices).toHaveLength(2);
    const depth0Px = await pixelAt(slices[0].image, 0, 5);
    expect(depth0Px).toEqual({ ...RED, a: 255 });

    const depth1Px = await pixelAt(slices[1].image, 0, 5);
    expect(depth1Px).toEqual({ ...GREEN, a: 255 });
  });

  it('fills with the given background color where a nested row runs past the source edge', async () => {
    // No coverFitMode pre-resize (targetWidth stays 500 even for a depth-1
    // row), so the depth-offset x-shift pushes the requested window right
    // past the source's actual width -- the uncovered strip on the right
    // must be the given background color, not source content wrapping or an
    // error.
    const input = await stripedImage(TARGET_WIDTH, [BLUE]);
    const rows: WallpaperRow[] = [{ depth: 1, isSpacer: true }];
    const background = { r: 5, g: 6, b: 7, alpha: 255 };

    const slices = await sliceWallpaper(input, rows, {
      coverFitMode: false,
      backgroundColor: background,
    });

    expect(slices).toHaveLength(1);
    const rightEdgePx = await pixelAt(slices[0].image, TARGET_WIDTH - 1, 5);
    expect(rightEdgePx).toEqual({
      r: background.r,
      g: background.g,
      b: background.b,
      a: background.alpha,
    });
  });

  it("treats backgroundColor.alpha as a 0-255 byte, not sharp's native 0-1 float", async () => {
    // Regression test: sharp's create.background.alpha is 0-1 (via the
    // `color` module) and clamps anything >= 1 to fully opaque -- confirmed
    // directly against the installed sharp version. A background alpha of
    // 128 (mid-range) must come out as ~128 in the output, not 255; if the
    // 0-255-to-0-1 conversion were ever removed, this would fail (128
    // unconverted would clamp to fully opaque = 255).
    const input = await stripedImage(TARGET_WIDTH, [BLUE]);
    const rows: WallpaperRow[] = [{ depth: 1, isSpacer: true }];
    const background = { r: 5, g: 6, b: 7, alpha: 128 };

    const slices = await sliceWallpaper(input, rows, {
      coverFitMode: false,
      backgroundColor: background,
    });

    const rightEdgePx = await pixelAt(slices[0].image, TARGET_WIDTH - 1, 5);
    expect(rightEdgePx.a).toBeGreaterThan(120);
    expect(rightEdgePx.a).toBeLessThan(136);
  });

  it('coverFitMode pre-resizes the whole image so a nested row has real content instead of running off the edge', async () => {
    // Same setup as the background-fill test, but with coverFitMode (the
    // default) -- the source is resized wider first specifically so a
    // depth-1 row's window still lands on real image content.
    const input = await stripedImage(TARGET_WIDTH, [BLUE]);
    const rows: WallpaperRow[] = [{ depth: 1, isSpacer: true }];

    const slices = await sliceWallpaper(input, rows);

    expect(slices).toHaveLength(1);
    const rightEdgePx = await pixelAt(slices[0].image, TARGET_WIDTH - 1, 5);
    expect(rightEdgePx).toEqual({ ...BLUE, a: 255 });
  });

  it('rejects a corrupt/non-image buffer with InvalidImageError', async () => {
    const notAnImage = Buffer.from(
      'definitely not an image, padded out further with text',
    );
    await expect(
      sliceWallpaper(notAnImage, buildAlternatingRowPlan(3, 'flat')),
    ).rejects.toBeInstanceOf(InvalidImageError);
  });

  it('rejects an oversized source image with ImageTooLargeError', async () => {
    const huge = await sharp({
      create: { width: 25000, height: 40, channels: 3, background: RED },
    })
      .png()
      .toBuffer();
    await expect(
      sliceWallpaper(huge, buildAlternatingRowPlan(3, 'flat')),
    ).rejects.toBeInstanceOf(ImageTooLargeError);
  });

  it('produces output rows at the canonical TARGET_WIDTH x TARGET_HEIGHT size', async () => {
    const input = await stripedImage(TARGET_WIDTH, [RED, GREEN]);
    const slices = await sliceWallpaper(
      input,
      buildAlternatingRowPlan(2, 'flat'),
      {
        coverFitMode: false,
      },
    );
    for (const slice of slices) {
      const meta = await sharp(slice.image).metadata();
      expect(meta.width).toBe(TARGET_WIDTH);
      expect(meta.height).toBe(TARGET_HEIGHT);
    }
  });
});
