import type Cropper from "cropperjs";

/** The saved banner size: TeamSpeak draws channel banners at 500 x 44 px. */
export const BANNER_WIDTH = 500;
export const BANNER_HEIGHT = 44;

/**
 * The one function that turns the current crop into banner pixels. The
 * editor's TeamSpeak preview and the upload both call it, so the preview
 * shows exactly the pixels that will be saved (T-142-F1 item 15).
 */
export function exportBanner(cropper: Pick<Cropper, "getCroppedCanvas">) {
  const canvas = cropper.getCroppedCanvas({
    width: BANNER_WIDTH,
    height: BANNER_HEIGHT,
    imageSmoothingQuality: "high",
  });
  if (!canvas) throw new Error("Canvas unavailable");
  return canvas;
}

/** PNG data URL of an exported banner, for the preview. */
export function bannerDataUrl(canvas: HTMLCanvasElement) {
  return canvas.toDataURL("image/png");
}

/** PNG blob of an exported banner, for the upload. */
export function bannerBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("Image encoding failed"))),
      "image/png",
    ),
  );
}

/** H for a W at the locked 500 : 44 ratio (T-142-F3 R6), in source pixels. */
export const heightForWidth = (width: number) => Math.round((width * BANNER_HEIGHT) / BANNER_WIDTH);

/** W for an H at the locked 500 : 44 ratio. */
export const widthForHeight = (height: number) =>
  Math.round((height * BANNER_WIDTH) / BANNER_HEIGHT);
