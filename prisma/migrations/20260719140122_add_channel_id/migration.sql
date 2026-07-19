-- AlterTable
ALTER TABLE "ChannelImage" ADD COLUMN "channelId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ChannelImage_channelId_key" ON "ChannelImage"("channelId");

