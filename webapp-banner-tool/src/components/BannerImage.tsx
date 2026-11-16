import { useState, type ReactNode } from "react";

interface BannerImageProps {
  src: string | null;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  /** Shown when there is no banner or it fails to load (404, decode error). */
  fallback: ReactNode;
  lazy?: boolean;
}

/**
 * A banner image that falls back to a quiet empty tile when there is none or
 * it fails to load – never the browser's broken-image icon (T-142-F4,
 * F-142-28). The layer panel thumbnails and the dock's Before strip use it.
 */
export function BannerImage({
  src,
  alt,
  className,
  width,
  height,
  fallback,
  lazy,
}: BannerImageProps) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return <>{fallback}</>;
  return (
    <img
      className={className}
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={lazy ? "lazy" : undefined}
      onError={() => setFailed(src)}
    />
  );
}
