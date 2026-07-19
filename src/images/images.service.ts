import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ImagesService {
  constructor(private prisma: PrismaService) {}

  async getImage(
    channelName: string,
  ): Promise<{ image: Buffer; mimeType: string } | null> {
    const result = await this.prisma.channelImage.findUnique({
      where: { channelName },
      select: {
        image: true,
        mimeType: true,
      },
    });

    if (!result) return null;

    return {
      image: Buffer.from(result.image),
      mimeType: result.mimeType,
    };
  }

  /**
   * Looks up the row (if any) already tied to a given TeamSpeak channel ID.
   * Used by the upload-path channel resolution to decide whether an upload
   * is a rename-safe update to an already-known channel, as opposed to a
   * brand new channel or a name collision with a different channel.
   */
  async findByChannelId(
    channelId: string,
  ): Promise<{ channelName: string } | null> {
    return this.prisma.channelImage.findUnique({
      where: { channelId },
      select: { channelName: true },
    });
  }

  /**
   * Reports whether a row already exists for the given normalized
   * channelName, regardless of its channelId (or lack of one). Used by the
   * upload-path channel resolution to detect the collision case: a live
   * channel resolves to a channelId that has no row yet, but a *different*
   * row already occupies this channelName.
   */
  async channelNameInUse(channelName: string): Promise<boolean> {
    const row = await this.prisma.channelImage.findUnique({
      where: { channelName },
      select: { channelName: true },
    });
    return row !== null;
  }

  /**
   * Saves (creating or updating) the stored image for a channel.
   *
   * When `channelId` is provided, the row is keyed by it — the actual stable
   * identity now that TeamSpeak channel IDs are resolved at write time — and
   * `channelName` is written/refreshed on that same row, so a channel rename
   * updates the existing row instead of creating a second one. When
   * `channelId` is omitted (legacy call sites, or rows from before the
   * backfill), the row is keyed by `channelName` alone, matching the
   * previous behavior.
   */
  async saveImage(
    channelName: string,
    buffer: Buffer,
    mimeType: string,
    channelId?: string | null,
  ): Promise<void> {
    const image = new Uint8Array(buffer);
    if (channelId) {
      await this.prisma.channelImage.upsert({
        where: { channelId },
        update: { channelName, image, mimeType },
        create: { channelId, channelName, image, mimeType },
      });
      return;
    }
    await this.prisma.channelImage.upsert({
      where: { channelName },
      update: { image, mimeType },
      create: { channelName, image, mimeType },
    });
  }

  async listOptions(): Promise<
    Array<{ channelName: string; mimeType: string }>
  > {
    const rows = await this.prisma.channelImage.findMany({
      select: { channelName: true, mimeType: true },
    });
    return rows.map((r) => ({
      channelName: r.channelName,
      mimeType: r.mimeType,
    }));
  }
}
