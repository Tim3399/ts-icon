import type { ReactNode } from "react";

interface BannerFrameProps {
  /** Omit to render the empty placeholder instead of an image. */
  src?: string | null;
  alt?: string;
  placeholder?: ReactNode;
  /** Keeps the exact 500x44 banner proportions at any column width. */
  ratio?: boolean;
  lazy?: boolean;
  className?: string;
  imageKey?: string | number;
  onError?: () => void;
}

// A banner is a 500x44 PNG that is very often partly transparent. Showing it
// on a flat surface makes "transparent" and "the wrong background colour"
// look identical, so every banner in the app sits on the same checkerboard at
// the same aspect ratio.
export default function BannerFrame({
  src,
  alt = "",
  placeholder = "No image",
  ratio = true,
  lazy = false,
  className,
  imageKey,
  onError,
}: BannerFrameProps) {
  const classes = [
    "banner-frame",
    "checkerboard",
    ratio ? "banner-frame-ratio" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      {src ? (
        <img
          key={imageKey}
          src={src}
          alt={alt}
          loading={lazy ? "lazy" : undefined}
          onError={onError}
        />
      ) : (
        <span className="banner-frame-placeholder">{placeholder}</span>
      )}
    </div>
  );
}
