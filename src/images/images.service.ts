import { ConflictException, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { ChannelImage } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  normalizeChannelName,
  isSpacerChannelName,
  SPACER_BASE_IMAGE_CHANNEL_NAME,
} from "../util/util";

export function computeContentHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export interface StoredImage {
  image: Buffer;
  mimeType: string;
  contentHash: string;
}

function representation(row: ChannelImage | null): StoredImage | null {
  if (!row) return null;
  const image = Buffer.from(row.image);
  return {
    image,
    mimeType: row.mimeType,
    contentHash: row.contentHash || computeContentHash(image),
  };
}

function aliasMatches(alias: string, requested: string): boolean {
  if (requested === SPACER_BASE_IMAGE_CHANNEL_NAME) return alias === requested;
  return (
    alias !== SPACER_BASE_IMAGE_CHANNEL_NAME &&
    normalizeChannelName(alias) === normalizeChannelName(requested)
  );
}

@Injectable()
export class ImagesService {
  constructor(private readonly prisma: PrismaService) {}

  private async legacyIds(channelName: string): Promise<string[]> {
    const [aliases, rows] = await Promise.all([
      this.prisma.channelImageAlias.findMany({ select: { alias: true, imageId: true } }),
      this.prisma.channelImage.findMany({ select: { id: true, channelName: true } }),
    ]);
    return [
      ...new Set([
        ...aliases.filter((r) => aliasMatches(r.alias, channelName)).map((r) => r.imageId),
        ...rows.filter((r) => aliasMatches(r.channelName, channelName)).map((r) => r.id),
      ]),
    ];
  }

  async getImage(channelName: string): Promise<StoredImage | null> {
    const ids = await this.legacyIds(channelName);
    if (ids.length > 1) {
      throw new ConflictException(
        "This legacy image name is ambiguous; use the channel-ID image URL",
      );
    }
    return ids.length
      ? representation(
          await this.prisma.channelImage.findUnique({
            where: { id: ids[0] },
          }),
        )
      : null;
  }

  async getImageByChannelId(channelId: string): Promise<StoredImage | null> {
    return representation(await this.prisma.channelImage.findUnique({ where: { channelId } }));
  }

  async getPublicImageByChannelId(channelId: string): Promise<StoredImage | null> {
    const own = await this.getImageByChannelId(channelId);
    if (own) return own;
    const channel = await this.prisma.channelReference.findUnique({ where: { cid: channelId } });
    if (channel) {
      const references = await this.prisma.channelReference.findMany();
      const sameName = references.filter(
        (r) => normalizeChannelName(r.name) === normalizeChannelName(channel.name),
      );
      const ids = await this.legacyIds(channel.name);
      if (sameName.length === 1 && ids.length === 1) {
        const legacy = await this.prisma.channelImage.findUnique({ where: { id: ids[0] } });
        if (legacy && legacy.channelId === null) return representation(legacy);
      }
    }
    return channel?.isSpacer ? this.getImage(SPACER_BASE_IMAGE_CHANNEL_NAME) : null;
  }

  async syncChannels(channels: { cid: string; name: string }[], replace = false): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const channel of channels)
        await tx.channelReference.upsert({
          where: { cid: channel.cid },
          create: {
            cid: channel.cid,
            name: channel.name,
            isSpacer: isSpacerChannelName(channel.name),
          },
          update: { name: channel.name, isSpacer: isSpacerChannelName(channel.name) },
        });
      if (replace)
        await tx.channelReference.deleteMany({
          where: { cid: { notIn: channels.map((c) => c.cid) } },
        });
    });
  }

  async findByChannelId(channelId: string): Promise<{ channelName: string } | null> {
    return this.prisma.channelImage.findUnique({
      where: { channelId },
      select: { channelName: true },
    });
  }

  async channelNameInUse(channelName: string): Promise<boolean> {
    return (await this.legacyIds(channelName)).length > 0;
  }

  async saveImage(
    channelName: string,
    buffer: Buffer,
    mimeType: string,
    channelId?: string | null,
    lastEditorSubject?: string | null,
  ): Promise<void> {
    const data = {
      channelName,
      image: new Uint8Array(buffer),
      mimeType,
      size: buffer.length,
      contentHash: computeContentHash(buffer),
      ...(channelId ? { channelId } : {}),
      ...(lastEditorSubject !== undefined ? { lastEditorSubject } : {}),
    };
    // Legacy writes are retained for the shared spacer image and old API clients.
    // Resolve before the transaction; its write checks the same identity again.
    const legacyIds = await this.legacyIds(channelName);
    if (!channelId && legacyIds.length > 1)
      throw new ConflictException("Ambiguous legacy image name");
    await this.prisma.$transaction(async (tx) => {
      let old = channelId
        ? await tx.channelImage.findUnique({ where: { channelId } })
        : legacyIds.length
          ? await tx.channelImage.findUnique({ where: { id: legacyIds[0] } })
          : await tx.channelImage.findFirst({ where: { channelName, channelId: null } });
      if (channelId && !old && legacyIds.length === 1) {
        const references = await tx.channelReference.findMany();
        const matches = references.filter(
          (r) => normalizeChannelName(r.name) === normalizeChannelName(channelName),
        );
        if (matches.length === 1 && matches[0].cid === channelId) {
          const candidate = await tx.channelImage.findUnique({ where: { id: legacyIds[0] } });
          if (candidate?.channelId === null) old = candidate;
        }
      }
      if (channelId) {
        await tx.channelReference.upsert({
          where: { cid: channelId },
          create: { cid: channelId, name: channelName, isSpacer: isSpacerChannelName(channelName) },
          update: { name: channelName, isSpacer: isSpacerChannelName(channelName) },
        });
      }
      const row = old
        ? await tx.channelImage.update({ where: { id: old.id }, data })
        : channelId
          ? await tx.channelImage.upsert({
              where: { channelId },
              update: data,
              create: { ...data, channelId },
            })
          : await tx.channelImage.create({ data });
      for (const alias of new Set(
        [channelName, old?.channelName].filter((s): s is string => !!s),
      )) {
        await tx.channelImageAlias.upsert({
          where: { alias_imageId: { alias, imageId: row.id } },
          update: {},
          create: { alias, imageId: row.id },
        });
      }
    });
  }

  async deleteImage(channelName: string): Promise<boolean> {
    const ids = await this.legacyIds(channelName);
    if (ids.length > 1)
      throw new ConflictException("Ambiguous legacy image name; delete by channel ID");
    if (!ids.length) return false;
    return (await this.prisma.channelImage.deleteMany({ where: { id: ids[0] } })).count > 0;
  }

  async deleteImageByChannelId(channelId: string): Promise<boolean> {
    return (await this.prisma.channelImage.deleteMany({ where: { channelId } })).count > 0;
  }

  async listOptions() {
    return this.prisma.channelImage.findMany({
      select: { id: true, channelId: true, channelName: true, mimeType: true, contentHash: true },
      orderBy: { channelName: "asc" },
    });
  }

  async listMetadata() {
    return this.prisma.channelImage.findMany({
      select: { channelId: true, channelName: true, contentHash: true },
    });
  }

  async getWallpaperImage(runId: string, position: number): Promise<StoredImage | null> {
    const row = await this.prisma.wallpaperRunRow.findUnique({
      where: { runId_position: { runId, position } },
    });
    if (!row || row.status === "deleted") return null;
    if (row.cid) {
      const saved = await this.getImageByChannelId(row.cid);
      if (saved) return saved;
    }
    if (!row.image) return null;
    const image = Buffer.from(row.image);
    return { image, mimeType: "image/png", contentHash: computeContentHash(image) };
  }
}
