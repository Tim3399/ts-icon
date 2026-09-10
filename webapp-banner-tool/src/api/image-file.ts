export function imageFileError(file: File): string | null {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return "Choose a PNG, JPEG or WebP image.";
  if (file.size > 10 * 1024 * 1024) return "Choose an image smaller than 10 MB.";
  return null;
}
