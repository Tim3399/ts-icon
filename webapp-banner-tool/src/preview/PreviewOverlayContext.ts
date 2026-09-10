import { createContext, useContext } from "react";
export interface PendingWallpaperRow {
  depth: number;
  isSpacer: boolean;
  imageDataUrl: string;
}

export interface PreviewOverlay {
  /** Same meaning as ChannelWallpaperGenerator's chosen parent: null = top-level. */
  parentCid: string | null;
  rows: PendingWallpaperRow[];
}

export interface PreviewOverlayContextValue {
  overlay: PreviewOverlay | null;
  setOverlay: (overlay: PreviewOverlay | null) => void;
  /** Bump after any mutation so the persistent panel re-fetches sooner than its next poll. */
  bumpRefresh: () => void;
  refreshKey: number;
}

export const PreviewOverlayContext = createContext<PreviewOverlayContextValue | null>(null);

export function usePreviewOverlay(): PreviewOverlayContextValue {
  const ctx = useContext(PreviewOverlayContext);
  if (!ctx) {
    throw new Error("usePreviewOverlay must be used within a PreviewOverlayProvider");
  }
  return ctx;
}
