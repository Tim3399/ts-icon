import * as path from "node:path";
import { fileURLToPath } from "node:url";

/** Relative database paths always belong to <project>/prisma, in CLI and app. */
export function resolveSqlitePath(rawUrl: string, projectRoot = process.cwd()): string {
  if (!rawUrl.startsWith("file:") || rawUrl.length === 5) {
    throw new Error("DATABASE_URL must be a non-empty SQLite file: URL.");
  }
  const databasePath = rawUrl.startsWith("file://")
    ? fileURLToPath(new URL(rawUrl))
    : rawUrl.slice(5);
  if (databasePath === ":memory:" || /[\r\n\0?]/.test(databasePath)) {
    throw new Error("DATABASE_URL must name a persistent SQLite file without query parameters.");
  }
  return path.isAbsolute(databasePath)
    ? path.normalize(databasePath)
    : path.resolve(projectRoot, "prisma", databasePath);
}

export function sqliteDatasourceUrl(rawUrl: string, projectRoot = process.cwd()): string {
  return `file:${resolveSqlitePath(rawUrl, projectRoot).split(path.sep).join("/")}`;
}
