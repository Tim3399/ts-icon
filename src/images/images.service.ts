import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Lowercase hex SHA-256 digest of the exact bytes stored for an image. This
 * is the value persisted in `ChannelImage.contentHash` and used as the
 * `GET /images/:channelName` ETag.
 */
export function computeContentHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

@Injectable()
export class ImagesService {
  constructor(private prisma: PrismaService) {}

  async getImage(
    channelName: string,
  ): Promise<{ image: Buffer; mimeType: string; contentHash: string } | null> {
    const result = await this.prisma.channelImage.findUnique({
      where: { channelName },
      select: {
        image: true,
        mimeType: true,
        contentHash: true,
      },
    });

    if (!result) return null;

    const image = Buffer.from(result.image);
    // Rows written before the contentHash column existed carry the '' the
    // migration backfilled them with (SQLite has no builtin SHA-256, so it
    // couldn't be computed at migration time). Rather than a background
    // write on a read path, compute the real hash from the bytes already in
    // hand for this response; the DB value itself only gets corrected the
    // next time this channel is actually saved (see `saveImage`).
    const contentHash = result.contentHash || computeContentHash(image);

    return {
      image,
      mimeType: result.mimeType,
      contentHash,
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
   *
   * `size`/`contentHash` are always (re)computed from `buffer` on every save
   * — this is what corrects a legacy row's empty-placeholder `contentHash`
   * (see `getImage`) the next time it's actually written.
   *
   * `lastEditorSubject` is optional and, when omitted, is left untouched on
   * an update (not the same as clearing it to null) — not every call site
   * has a Keycloak subject to thread through yet, and a write that doesn't
   * know who's making it shouldn't erase a previously-recorded one.
   */
  async saveImage(
    channelName: string,
    buffer: Buffer,
    mimeType: string,
    channelId?: string | null,
    lastEditorSubject?: string | null,
  ): Promise<void> {
    const image = new Uint8Array(buffer);
    const size = buffer.length;
    const contentHash = computeContentHash(buffer);
    // Only included in the write payloads when actually provided, so an
    // omitted subject leaves an existing value alone on update (rather than
    // upsert's `update` clause explicitly nulling it out) and simply comes
    // out as the column's natural null default on create.
    const editorFields =
      lastEditorSubject !== undefined ? { lastEditorSubject } : {};

    if (channelId) {
      await this.prisma.channelImage.upsert({
        where: { channelId },
        update: {
          channelName,
          image,
          mimeType,
          size,
          contentHash,
          ...editorFields,
        },
        create: {
          channelId,
          channelName,
          image,
          mimeType,
          size,
          contentHash,
          ...editorFields,
        },
      });
      return;
    }
    await this.prisma.channelImage.upsert({
      where: { channelName },
      update: { image, mimeType, size, contentHash, ...editorFields },
      create: {
        channelName,
        image,
        mimeType,
        size,
        contentHash,
        ...editorFields,
      },
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
