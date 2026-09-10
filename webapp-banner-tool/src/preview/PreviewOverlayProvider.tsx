import { useState, useCallback, useMemo, type ReactNode } from "react";
import { PreviewOverlayContext, type PreviewOverlay } from "./PreviewOverlayContext";
export const PreviewOverlayProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [overlay, setOverlay] = useState<PreviewOverlay | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const value = useMemo(
    () => ({ overlay, setOverlay, bumpRefresh, refreshKey }),
    [overlay, bumpRefresh, refreshKey],
  );

  return <PreviewOverlayContext.Provider value={value}>{children}</PreviewOverlayContext.Provider>;
};
