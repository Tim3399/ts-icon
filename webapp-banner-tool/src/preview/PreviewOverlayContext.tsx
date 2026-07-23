import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

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

interface PreviewOverlayContextValue {
  overlay: PreviewOverlay | null;
  setOverlay: (overlay: PreviewOverlay | null) => void;
  /** Bump after any mutation so the persistent panel re-fetches sooner than its next poll. */
  bumpRefresh: () => void;
  refreshKey: number;
}

const PreviewOverlayContext = createContext<PreviewOverlayContextValue | null>(null);

/**
 * Backs the persistent right-hand live channel tree panel (see App.tsx).
 * Any page can call usePreviewOverlay().setOverlay(...) to splice not-yet-
 * created rows into that panel at the position they'd actually land in --
 * e.g. ChannelWallpaperGenerator pushes its sliced-but-unsubmitted rows here
 * so they show up in the real tree context instead of a disconnected stack.
 */
export const PreviewOverlayProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [overlay, setOverlay] = useState<PreviewOverlay | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const value = useMemo(
    () => ({ overlay, setOverlay, bumpRefresh, refreshKey }),
    [overlay, bumpRefresh, refreshKey],
  );

  return <PreviewOverlayContext.Provider value={value}>{children}</PreviewOverlayContext.Provider>;
};

export function usePreviewOverlay(): PreviewOverlayContextValue {
  const ctx = useContext(PreviewOverlayContext);
  if (!ctx) {
    throw new Error('usePreviewOverlay must be used within a PreviewOverlayProvider');
  }
  return ctx;
}
