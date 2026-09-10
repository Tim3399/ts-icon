import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  HttpException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { WallpaperRun, WallpaperRunRow } from "@prisma/client";
import type { TeamSpeak } from "ts3-nodejs-library";
import { getPublicBaseUrl } from "../../config";
import { PrismaService } from "../prisma/prisma.service";
import { ImagesService } from "./images.service";
import {
  listChannelsOnConnection,
  expectedBannerUrlForId,
  TeamSpeakChannelsService,
  type LiveChannel,
} from "../teamspeak/teamspeak-channels";
import { createManagedChannel } from "../teamspeak/teamspeak-channel-admin";

const ROW_METADATA = {
  runId: true,
  position: true,
  name: true,
  depth: true,
  isSpacer: true,
  cid: true,
  parentCid: true,
  status: true,
  error: true,
} as const;
type RowMetadata = Omit<WallpaperRunRow, "image">;
type RunMetadata = WallpaperRun & { rows: RowMetadata[] };
type FullRun = WallpaperRun & { rows: WallpaperRunRow[] };
const MAX_PREPARED_BYTES = 20 * 1024 * 1024;
const MAX_OPEN_RUNS = 20;
const LEASE_MS = 60_000;

export interface PreparedWallpaperRow {
  name: string;
  depth: number;
  isSpacer: boolean;
  image: Buffer;
}

export function wallpaperMarker(runId: string, position: number): string {
  return "ts-icon:" + runId + ":" + position;
}

export function wallpaperRowUrl(runId: string, position: number, baseUrl: string): string {
  return baseUrl + "/images/wallpaper/" + runId + "/" + position + ".png";
}

function message(error: unknown): string {
  return error instanceof HttpException
    ? error.message.slice(0, 500)
    : "The channel operation could not be completed. Check connectivity, permissions and storage, then retry.";
}

@Injectable()
export class ChannelWallpaperService {
  private readonly baseUrl = getPublicBaseUrl();
  constructor(
    private readonly prisma: PrismaService,
    private readonly images: ImagesService,
    private readonly channels: TeamSpeakChannelsService,
  ) {}

  result(run: RunMetadata) {
    const interrupted =
      (!run.leaseUntil || run.leaseUntil.getTime() < Date.now()) &&
      ["running", "undoing"].includes(run.status);
    const status = interrupted
      ? run.status === "undoing"
        ? "undo-partial"
        : "partial-failure"
      : run.status;
    const createdChannels = run.rows
      .filter((row) => row.cid && row.status !== "deleted")
      .map((row) => ({
        cid: row.cid!,
        name: row.name,
        kind: row.isSpacer ? ("spacer" as const) : ("art" as const),
        depth: row.depth,
        imageUrl: expectedBannerUrlForId(row.cid!, this.baseUrl),
      }));
    const failed = run.rows.find((row) => row.error);
    return {
      runId: run.id,
      requestId: run.requestId,
      status,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
      createdChannels,
      rowCount: createdChannels.length,
      ...(failed ? { failedAt: { name: failed.name, error: failed.error! } } : {}),
      ...(run.error
        ? { error: run.error }
        : interrupted
          ? { error: "The previous process stopped; review and resume or undo this run" }
          : {}),
    };
  }

  async get(runId: string) {
    const run = await this.prisma.wallpaperRun.findUnique({
      where: { id: runId },
      include: { rows: { select: ROW_METADATA, orderBy: { position: "asc" } } },
    });
    if (!run) throw new NotFoundException("Wallpaper run not found");
    return this.result(run);
  }

  async list() {
    const [open, finished] = await this.prisma.$transaction([
      this.prisma.wallpaperRun.findMany({
        where: { status: { notIn: ["completed", "undone"] } },
        orderBy: { createdAt: "desc" },
        include: { rows: { select: ROW_METADATA, orderBy: { position: "asc" } } },
      }),
      this.prisma.wallpaperRun.findMany({
        where: { status: { in: ["completed", "undone"] } },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { rows: { select: ROW_METADATA, orderBy: { position: "asc" } } },
      }),
    ]);
    return { runs: [...open, ...finished].map((run) => this.result(run)) };
  }

  async existing(requestId: string, requestHash: string) {
    const run = await this.prisma.wallpaperRun.findUnique({
      where: { requestId },
      include: { rows: { select: ROW_METADATA, orderBy: { position: "asc" } } },
    });
    if (run && run.requestHash !== requestHash) {
      throw new ConflictException(
        "This requestId was already used for different wallpaper settings",
      );
    }
    return run ? this.result(run) : null;
  }

  async prepare(
    requestId: string,
    requestHash: string,
    parentCid: string | null,
    rows: PreparedWallpaperRow[],
    createdBy?: string,
  ) {
    if (!rows.length)
      throw new UnprocessableEntityException("The image is too short for one banner row");
    if (rows.reduce((total, row) => total + row.image.length, 0) > MAX_PREPARED_BYTES) {
      throw new UnprocessableEntityException(
        "Prepared wallpaper exceeds the 20 MiB storage budget",
      );
    }
    try {
      const run = await this.prisma.$transaction(async (tx) => {
        const pending = await tx.wallpaperRun.count({
          where: { status: { notIn: ["completed", "undone"] } },
        });
        if (pending >= MAX_OPEN_RUNS) {
          throw new ConflictException(
            "There are 20 unfinished wallpaper runs; finish or undo one first",
          );
        }
        return tx.wallpaperRun.create({
          data: {
            requestId,
            requestHash,
            parentCid,
            createdBy,
            rows: {
              create: rows.map((row, position) => ({
                position,
                name: row.name,
                depth: row.depth,
                isSpacer: row.isSpacer,
                image: new Uint8Array(row.image),
              })),
            },
          },
          include: { rows: true },
        });
      });
      return this.result(run);
    } catch (error) {
      if ((error as { code?: string })?.code === "P2002") {
        const existing = await this.existing(requestId, requestHash);
        if (existing) return existing;
      }
      throw error;
    }
  }

  private async leased<T>(
    runId: string,
    status: "running" | "undoing",
    fn: (token: string, assertLease: () => Promise<void>) => Promise<T>,
  ): Promise<T> {
    const token = randomUUID();
    const claim = await this.prisma.wallpaperRun.updateMany({
      where: {
        id: runId,
        status:
          status === "running"
            ? { in: ["pending", "running", "partial-failure"] }
            : { not: "undone" },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
      },
      data: { leaseToken: token, leaseUntil: new Date(Date.now() + LEASE_MS), status, error: null },
    });
    if (!claim.count) {
      await this.get(runId);
      throw new ConflictException("This wallpaper run is still being processed; retry shortly");
    }
    let leaseLost = false;
    const renew = async () => {
      const renewed = await this.prisma.wallpaperRun.updateMany({
        where: { id: runId, leaseToken: token },
        data: { leaseUntil: new Date(Date.now() + LEASE_MS) },
      });
      if (!renewed.count) leaseLost = true;
    };
    const heartbeat = setInterval(() => {
      void renew().catch(() => {
        leaseLost = true;
      });
    }, 15_000);
    heartbeat.unref();
    const assertLease = async () => {
      if (leaseLost) throw new ConflictException("Wallpaper run lease was lost; reload its status");
      await renew();
      if (leaseLost) throw new ConflictException("Wallpaper run lease was lost");
    };
    try {
      return await fn(token, assertLease);
    } finally {
      clearInterval(heartbeat);
      await this.prisma.wallpaperRun.updateMany({
        where: { id: runId, leaseToken: token },
        data: { leaseToken: null, leaseUntil: null },
      });
      this.channels.invalidateCache();
    }
  }

  private async load(runId: string): Promise<FullRun> {
    const run = await this.prisma.wallpaperRun.findUnique({
      where: { id: runId },
      include: { rows: { orderBy: { position: "asc" } } },
    });
    if (!run) throw new NotFoundException("Wallpaper run not found");
    return run;
  }

  private async identify(
    ts3: TeamSpeak,
    run: FullRun,
    row: WallpaperRunRow,
    channels: LiveChannel[],
  ): Promise<LiveChannel | null> {
    const candidateUrl = wallpaperRowUrl(run.id, row.position, this.baseUrl);
    const candidates = row.cid
      ? channels.filter((channel) => channel.cid === row.cid)
      : channels.filter((channel) => channel.bannerGfxUrl === candidateUrl);
    const owned: LiveChannel[] = [];
    for (const channel of candidates) {
      const info = await ts3.channelInfo(channel.cid);
      if (info.channelDescription !== wallpaperMarker(run.id, row.position)) {
        if (row.cid)
          throw new ConflictException("Channel ownership marker changed; review it manually");
        continue;
      }
      if (
        channel.name !== row.name ||
        channel.pid !== row.parentCid ||
        ![candidateUrl, expectedBannerUrlForId(channel.cid, this.baseUrl)].includes(
          channel.bannerGfxUrl ?? "",
        )
      ) {
        throw new ConflictException(
          "The generated channel was changed; review it manually before proceeding",
        );
      }
      owned.push(channel);
    }
    if (owned.length > 1)
      throw new ConflictException("Multiple channels have this run marker; manual review required");
    return owned[0] ?? null;
  }

  async resume(runId: string) {
    const current = await this.get(runId);
    if (current.status === "completed") return current;
    if (["undone", "undo-partial", "undoing"].includes(current.status)) {
      throw new ConflictException("A run that has been undone cannot be resumed; start a new run");
    }
    return this.leased(runId, "running", async (token, assertLease) => {
      const run = await this.load(runId);
      try {
        await this.channels.withConnection(async (ts3) => {
          const channels = await listChannelsOnConnection(ts3);
          const parents = new Map<number, string | null>([[0, run.parentCid]]);
          const siblings = new Map<string | null, string>();
          for (const row of run.rows) {
            const parentCid = parents.get(row.depth);
            if (parentCid === undefined)
              throw new ConflictException("A parent row is missing; review the run");
            if (parentCid !== null && !channels.some((channel) => channel.cid === parentCid)) {
              throw new ConflictException("The selected parent channel no longer exists");
            }
            row.parentCid = parentCid;
            await assertLease();
            try {
              await this.prisma.wallpaperRunRow.update({
                where: {
                  runId_position: { runId, position: row.position },
                  run: { leaseToken: token },
                },
                data: { parentCid, error: null },
              });
              let channel = await this.identify(ts3, run, row, channels);
              if (
                !channel &&
                (row.cid || row.status === "creating" || row.status === "uncertain")
              ) {
                throw new ConflictException(
                  "Previous channel creation has an uncertain outcome; inspect TeamSpeak and its run marker before retrying",
                );
              }
              if (!channel) {
                if (channels.some((c) => c.pid === parentCid && c.name === row.name)) {
                  throw new ConflictException(
                    "A channel with this name already exists under the selected parent",
                  );
                }
                await this.prisma.wallpaperRunRow.update({
                  where: {
                    runId_position: { runId, position: row.position },
                    run: { leaseToken: token },
                  },
                  data: { status: "creating" },
                });
                row.status = "creating";
                await assertLease();
                const created = await createManagedChannel(ts3, {
                  parentCid,
                  name: row.name,
                  orderAfterCid: siblings.get(parentCid) ?? null,
                  bannerUrl: wallpaperRowUrl(runId, row.position, this.baseUrl),
                  description: wallpaperMarker(runId, row.position),
                });
                channel = {
                  ...created,
                  pid: parentCid,
                  bannerGfxUrl: wallpaperRowUrl(runId, row.position, this.baseUrl),
                };
                channels.push(channel);
              }
              row.cid = channel.cid;
              await assertLease();
              await this.prisma.wallpaperRunRow.update({
                where: {
                  runId_position: { runId, position: row.position },
                  run: { leaseToken: token },
                },
                data: { cid: row.cid, status: "created" },
              });
              await assertLease();
              if (row.image) {
                await this.images.saveImage(
                  row.name,
                  Buffer.from(row.image),
                  "image/png",
                  row.cid,
                  run.createdBy,
                );
              } else if (!(await this.images.getImageByChannelId(row.cid))) {
                throw new ConflictException(
                  "The saved image was removed; the run cannot restore it automatically",
                );
              }
              await assertLease();
              await ts3.channelEdit(row.cid, {
                channelBannerGfxUrl: expectedBannerUrlForId(row.cid, this.baseUrl),
              });
              await this.prisma.wallpaperRunRow.update({
                where: {
                  runId_position: { runId, position: row.position },
                  run: { leaseToken: token },
                },
                data: { status: "saved", image: null, error: null },
              });
              row.status = "saved";
              parents.set(row.depth + 1, row.cid);
              for (const depth of [...parents.keys()])
                if (depth > row.depth + 1) parents.delete(depth);
              siblings.set(parentCid, row.cid);
            } catch (error) {
              await this.prisma.wallpaperRunRow.update({
                where: {
                  runId_position: { runId, position: row.position },
                  run: { leaseToken: token },
                },
                data: {
                  error: message(error),
                  ...(row.status === "creating" && !row.cid ? { status: "uncertain" } : {}),
                },
              });
              throw error;
            }
          }
        });
        await this.prisma.wallpaperRun.updateMany({
          where: { id: runId, leaseToken: token },
          data: { status: "completed", error: null },
        });
      } catch (error) {
        await this.prisma.wallpaperRun.updateMany({
          where: { id: runId, leaseToken: token },
          data: { status: "partial-failure", error: message(error) },
        });
      }
      return this.get(runId);
    });
  }

  async undo(runId: string) {
    const current = await this.get(runId);
    if (current.status === "undone") return { deleted: [], failed: [], run: current };
    return this.leased(runId, "undoing", async (token, assertLease) => {
      const run = await this.load(runId);
      const deleted: string[] = [];
      const failed: { cid: string; error: string }[] = [];
      try {
        await this.channels.withConnection(async (ts3) => {
          const channels = await listChannelsOnConnection(ts3);
          // Children are created after parents, hence removed before them.
          for (const row of [...run.rows].reverse()) {
            if (row.status === "deleted") continue;
            try {
              await assertLease();
              const channel = await this.identify(ts3, run, row, channels);
              if (!channel && !row.cid && ["creating", "uncertain"].includes(row.status)) {
                throw new ConflictException(
                  "Creation outcome is unknown; no matching owned channel was found",
                );
              }
              if (channel) {
                row.cid = channel.cid;
                if (channels.some((c) => c.pid === channel.cid)) {
                  throw new ConflictException(
                    "The channel still contains subchannels; it was not deleted",
                  );
                }
                await assertLease();
                // Record reconciled identity and delete intent before the external
                // mutation. A lost response can then be retried when the CID is absent.
                await this.prisma.wallpaperRunRow.update({
                  where: {
                    runId_position: { runId, position: row.position },
                    run: { leaseToken: token },
                  },
                  data: { cid: channel.cid, status: "deleting" },
                });
                await assertLease();
                // force=false makes the server refuse an occupied channel, including
                // a client joining between our list and this command.
                await ts3.channelDelete(channel.cid, false);
                channels.splice(
                  channels.findIndex((c) => c.cid === channel.cid),
                  1,
                );
                deleted.push(channel.cid);
              }
              await this.prisma.$transaction(async (tx) => {
                const held = await tx.wallpaperRun.count({
                  where: { id: runId, leaseToken: token },
                });
                if (!held) throw new ConflictException("Wallpaper run lease was lost");
                if (row.cid) await tx.channelImage.deleteMany({ where: { channelId: row.cid } });
                await tx.wallpaperRunRow.update({
                  where: {
                    runId_position: { runId, position: row.position },
                    run: { leaseToken: token },
                  },
                  data: { status: "deleted", image: null, error: null, cid: row.cid },
                });
              });
            } catch (error) {
              failed.push({ cid: row.cid ?? "row-" + row.position, error: message(error) });
              await this.prisma.wallpaperRunRow.update({
                where: {
                  runId_position: { runId, position: row.position },
                  run: { leaseToken: token },
                },
                data: { error: message(error) },
              });
            }
          }
        });
      } catch (error) {
        failed.push({ cid: "connection", error: message(error) });
      }
      await this.prisma.wallpaperRun.updateMany({
        where: { id: runId, leaseToken: token },
        data: {
          status: failed.length ? "undo-partial" : "undone",
          error: failed[0]?.error ?? null,
        },
      });
      return { deleted, failed, run: await this.get(runId) };
    });
  }
}
