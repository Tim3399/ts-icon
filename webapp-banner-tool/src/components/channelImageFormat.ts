// Readable size and change time of a channel image for the Channel images
// table and inspector (T-142-F3 item 9, R1: `size` and `updatedAt` come from
// GET channels for channels with an image of their own).

/** "812 B", "18 KB", "1.4 MB"; null when the size is unknown. */
export function formatImageSize(bytes: number | undefined): string | null {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/**
 * "Today, 14:02", "Yesterday, 21:47" or "3 Nov 2026, 09:15" in local time;
 * null when the value is missing or not a date.
 */
export function formatImageUpdated(iso: string | undefined, now = new Date()): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const clock = time.format(at);
  if (sameDay(at, now)) return `Today, ${clock}`;
  if (sameDay(at, yesterday)) return `Yesterday, ${clock}`;
  return `${date.format(at)}, ${clock}`;
}
