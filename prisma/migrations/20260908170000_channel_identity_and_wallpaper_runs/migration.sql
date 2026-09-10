PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChannelImage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "channelId" TEXT,
  "channelName" TEXT NOT NULL,
  "image" BLOB NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "contentHash" TEXT NOT NULL,
  "lastEditorSubject" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ChannelImage" SELECT
  lower(hex(randomblob(16))), "channelId", "channelName", "image", "mimeType", "size",
  "contentHash", "lastEditorSubject", "createdAt", "updatedAt"
FROM "ChannelImage";
DROP TABLE "ChannelImage";
ALTER TABLE "new_ChannelImage" RENAME TO "ChannelImage";
CREATE UNIQUE INDEX "ChannelImage_channelId_key" ON "ChannelImage"("channelId");
CREATE INDEX "ChannelImage_channelName_idx" ON "ChannelImage"("channelName");
CREATE TABLE "ChannelImageAlias" (
  "alias" TEXT NOT NULL,
  "imageId" TEXT NOT NULL,
  PRIMARY KEY ("alias", "imageId"),
  FOREIGN KEY ("imageId") REFERENCES "ChannelImage"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "ChannelImageAlias" SELECT "channelName", "id" FROM "ChannelImage";
CREATE TABLE "WallpaperRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requestId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "parentCid" TEXT,
  "createdBy" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "error" TEXT,
  "leaseToken" TEXT,
  "leaseUntil" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "WallpaperRun_requestId_key" ON "WallpaperRun"("requestId");
CREATE TABLE "WallpaperRunRow" (
  "runId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "depth" INTEGER NOT NULL,
  "isSpacer" BOOLEAN NOT NULL,
  "image" BLOB,
  "cid" TEXT,
  "parentCid" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "error" TEXT,
  PRIMARY KEY ("runId", "position"),
  FOREIGN KEY ("runId") REFERENCES "WallpaperRun"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "WallpaperRunRow_cid_idx" ON "WallpaperRunRow"("cid");
CREATE TABLE "ChannelReference" (
  "cid" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "isSpacer" BOOLEAN NOT NULL
);
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
