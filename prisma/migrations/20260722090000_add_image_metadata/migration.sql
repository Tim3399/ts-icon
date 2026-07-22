-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChannelImage" (
    "channelName" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT,
    "image" BLOB NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "lastEditorSubject" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Backfill for pre-existing rows: "size" is a pure function of the
-- already-stored bytes, so it's computed directly here with SQLite's
-- builtin LENGTH(). "contentHash" cannot be computed in plain SQL (SQLite
-- has no builtin SHA-256), so it's left as an empty-string placeholder for
-- any row that existed before this migration; ImagesService recognizes that
-- placeholder and computes the real hash on the fly for reads, and persists
-- a real hash the next time such a row is actually saved. "createdAt" is
-- backfilled to the migration time itself, since the true original creation
-- time was never tracked before this column existed.
INSERT INTO "new_ChannelImage" ("channelName", "channelId", "image", "mimeType", "size", "contentHash", "lastEditorSubject")
SELECT "channelName", "channelId", "image", "mimeType", LENGTH("image"), '', NULL FROM "ChannelImage";
DROP TABLE "ChannelImage";
ALTER TABLE "new_ChannelImage" RENAME TO "ChannelImage";
CREATE UNIQUE INDEX "ChannelImage_channelId_key" ON "ChannelImage"("channelId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
