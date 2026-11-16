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

/** A crop in source pixels. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Size = { width: number; height: number };

/**
 * The crop limits for a source image (T-142-F4, F-142-34): the frame is at
 * least 500 source px wide (or the whole image when it is narrower), never
 * wider or taller than the image at the locked 500 : 44 ratio, and its
 * height is never 0.
 */
export function cropLimits(natural: Size) {
  const maxWidth = Math.max(1, Math.min(natural.width, widthForHeight(natural.height)));
  const minWidth = Math.min(BANNER_WIDTH, maxWidth);
  return { minWidth, maxWidth };
}

/** The nearest valid crop: width clamped, height from the ratio, the frame inside the image. */
export function clampCrop(rect: CropRect, natural: Size): CropRect {
  const { minWidth, maxWidth } = cropLimits(natural);
  const width = Math.min(maxWidth, Math.max(minWidth, Math.round(rect.width)));
  const height = Math.max(1, Math.min(natural.height, heightForWidth(width)));
  const x = Math.min(Math.max(0, Math.round(rect.x)), Math.max(0, natural.width - width));
  const y = Math.min(Math.max(0, Math.round(rect.y)), Math.max(0, natural.height - height));
  return { x, y, width, height };
}

/** True when the crop is inside the limits (1 px of rounding allowed). */
export function isValidCrop(rect: CropRect, natural: Size) {
  const valid = clampCrop(rect, natural);
  return (
    rect.height >= 1 &&
    (["x", "y", "width", "height"] as const).every((key) => Math.abs(valid[key] - rect[key]) <= 1)
  );
}

/** True when an exported banner has no visible pixel; such a banner is never sent (F-142-34). */
export function isBlankBanner(canvas: HTMLCanvasElement) {
  // Only a real canvas can be inspected (test doubles carry the encoders only).
  if (typeof canvas.getContext !== "function") return false;
  if (!canvas.width || !canvas.height) return true;
  const context = canvas.getContext("2d");
  if (!context) return false;
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return false;
  return true;
}
