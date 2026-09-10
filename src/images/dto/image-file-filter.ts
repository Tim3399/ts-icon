import { BadRequestException, UnsupportedMediaTypeException } from "@nestjs/common";
import type { Express } from "express";

const MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/** Filters declared types before buffering; image processing still verifies the actual bytes. */
export function imageFileFilter(
  req: unknown,
  file: Express.Multer.File,
  cb: (err: Error | null, acceptFile: boolean) => void,
) {
  if (!file?.mimetype) return cb(new BadRequestException("Invalid file"), false);
  if (!MIME_TYPES.has(file.mimetype))
    return cb(new UnsupportedMediaTypeException("Unsupported image format"), false);
  cb(null, true);
}
