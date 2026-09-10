export interface Channel {
  cid: string;
  name: string;
  imageUrl?: string | null;
  hasImage?: boolean;
  hasFallback?: boolean;
  contentHash?: string | null;
  isSpacer?: boolean;
  pid: string | null;
  depth: number;
  bannerGfxUrl?: string | null;
  managed?: boolean;
}
export interface ChannelList {
  channels: string[];
  items: Channel[];
}
export interface PreviewRow {
  depth: number;
  isSpacer: boolean;
  imageDataUrl: string;
}
export interface CreatedChannel {
  cid: string;
  name: string;
  kind: "art" | "spacer";
  depth: number;
  imageUrl?: string;
}
export interface WallpaperRun {
  runId: string;
  requestId: string;
  status:
    | "pending"
    | "running"
    | "completed"
    | "partial-failure"
    | "undoing"
    | "undo-partial"
    | "undone";
  createdChannels: CreatedChannel[];
  rowCount: number;
  failedAt?: { name: string; error: string };
  error?: string | null;
  createdAt?: string;
  updatedAt?: string;
}
