import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { type INestApplication } from "@nestjs/common";
import { inputValidation } from "../http/input-validation";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Server } from "node:http";
import request from "supertest";
import sharp from "sharp";
import { PrismaService } from "../prisma/prisma.service";
import { PrismaModule } from "../prisma/prisma.module";
import { ImagesService } from "./images.service";
import { ImagesModuleLocal } from "./images.module.local";
import { ImagesModulePublic } from "./images.module.public";
import {
  ChannelWallpaperService,
  wallpaperMarker,
  wallpaperRowUrl,
} from "./channel-wallpaper.service";
import {
  TeamSpeakChannelsService,
  listChannelsOnConnection,
} from "../teamspeak/teamspeak-channels";

// These HTTP workflows commit to real SQLite files. Shared Windows runners can
// exceed Jest's 5-second default during multi-step generate/undo/recreate flows.
jest.setTimeout(30_000);

let mockDbUrl = "";
jest.mock("../../config", () => ({
  ...jest.requireActual<typeof import("../../config")>("../../config"),
  get DATABASE_URL() {
    return mockDbUrl;
  },
  getPublicBaseUrl: () => "https://example.test",
}));
jest.mock("../teamspeak/teamspeak-channels", () => ({
  ...jest.requireActual<typeof import("../teamspeak/teamspeak-channels")>(
    "../teamspeak/teamspeak-channels",
  ),
  listChannelsOnConnection: jest.fn(),
}));

type RunResult = Awaited<ReturnType<ChannelWallpaperService["get"]>>;
function runBody(response: { body: unknown }): RunResult {
  return response.body as RunResult;
}
function undoBody(response: {
  body: unknown;
}): Awaited<ReturnType<ChannelWallpaperService["undo"]>> {
  return response.body as Awaited<ReturnType<ChannelWallpaperService["undo"]>>;
}
interface FakeChannel {
  cid: string;
  name: string;
  pid: string | null;
  bannerGfxUrl: string;
  description: string;
  occupied?: boolean;
}
const channels = new Map<string, FakeChannel>();
let nextCid = 1;
let disconnectAfterCreate = false;
const fakeTs = {
  channelCreate: jest.fn(
    (
      name: string,
      props: { cpid: string; channelBannerGfxUrl: string; channelDescription: string },
    ) => {
      const cid = String(nextCid++);
      channels.set(cid, {
        cid,
        name,
        pid: props.cpid === "0" ? null : props.cpid,
        bannerGfxUrl: props.channelBannerGfxUrl,
        description: props.channelDescription,
      });
      if (disconnectAfterCreate) {
        disconnectAfterCreate = false;
        throw new Error("Connection lost after server accepted creation");
      }
      return Promise.resolve({ cid, name });
    },
  ),
  channelInfo: jest.fn((cid: string) =>
    Promise.resolve({ channelDescription: channels.get(cid)?.description }),
  ),
  channelEdit: jest.fn((cid: string, props: { channelBannerGfxUrl: string }) => {
    const channel = channels.get(cid);
    if (!channel) throw new Error("Channel not found");
    channel.bannerGfxUrl = props.channelBannerGfxUrl;
    return Promise.resolve([]);
  }),
  channelDelete: jest.fn((cid: string, force: boolean) => {
    const channel = channels.get(cid);
    if (force) throw new Error("Test refuses forced channel deletion");
    if (channel?.occupied) throw new Error("Channel is occupied");
    if (!channel) throw new Error("Channel not found");
    channels.delete(cid);
    return Promise.resolve([]);
  }),
};

const channelAccess = {
  withConnection: jest.fn((fn: (ts3: import("ts3-nodejs-library").TeamSpeak) => Promise<unknown>) =>
    fn(fakeTs as never),
  ),
  fetchLiveChannels: jest.fn(() => Promise.resolve([...channels.values()])),
  invalidateCache: jest.fn(),
};

describe("CID images and durable wallpaper runs (real SQLite + HTTP)", () => {
  let prisma: PrismaService;
  let images: ImagesService;
  let runs: ChannelWallpaperService;
  let app: INestApplication;
  let databasePath: string;
  let png: Buffer;
  const reqServer = () => app.getHttpServer() as Server;

  beforeAll(async () => {
    databasePath = path.join(os.tmpdir(), "ts-icon-runs-" + randomUUID() + ".db");
    fs.writeFileSync(databasePath, "");
    mockDbUrl = "file:" + databasePath.split(path.sep).join("/");
    const repo = path.resolve(__dirname, "../..");
    execFileSync(
      process.execPath,
      [path.join(repo, "node_modules/prisma/build/index.js"), "migrate", "deploy"],
      {
        cwd: repo,
        env: { ...process.env, DATABASE_URL: mockDbUrl },
        stdio: "pipe",
      },
    );
    prisma = new PrismaService();
    await prisma.onModuleInit();
    const module = await Test.createTestingModule({
      imports: [PrismaModule, ImagesModuleLocal, ImagesModulePublic],
    })
      .overrideProvider(TeamSpeakChannelsService)
      .useValue(channelAccess)
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(inputValidation());
    await app.init();
    images = app.select(ImagesModuleLocal).get(ImagesService, { strict: true });
    runs = app.get(ChannelWallpaperService);
    png = await sharp({ create: { width: 500, height: 88, channels: 3, background: "red" } })
      .png()
      .toBuffer();
  }, 30_000);

  beforeEach(async () => {
    jest.restoreAllMocks();
    await prisma.wallpaperRun.deleteMany();
    await prisma.channelImage.deleteMany();
    await prisma.channelReference.deleteMany();
    channels.clear();
    nextCid = 1;
    disconnectAfterCreate = false;
    jest.clearAllMocks();
    jest.mocked(channelAccess.withConnection).mockImplementation(async (fn) => fn(fakeTs as never));
    jest
      .mocked(channelAccess.fetchLiveChannels)
      .mockImplementation(() => Promise.resolve([...channels.values()]));
    jest
      .mocked(listChannelsOnConnection)
      .mockImplementation(() => Promise.resolve([...channels.values()]));
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.onModuleDestroy();
    for (const suffix of ["", "-journal", "-wal", "-shm"]) {
      if (fs.existsSync(databasePath + suffix)) fs.unlinkSync(databasePath + suffix);
    }
  });

  function generate(requestId = randomUUID(), prefix = "Wall", mode = "flat") {
    return request(reqServer())
      .post("/images-local/channel-wallpaper")
      .field("requestId", requestId)
      .field("namePrefix", prefix)
      .field("spacerMode", mode)
      .attach("file", png, "wall.png");
  }

  it("generates through the actual route, serves every CID image, and deduplicates retries", async () => {
    const requestId = randomUUID();
    const response = await generate(requestId).expect(201);
    const run = runBody(response);
    expect(run.status).toBe("completed");
    expect(run.createdChannels).toHaveLength(2);
    for (const channel of run.createdChannels) {
      const image = await request(reqServer()).get(new URL(channel.imageUrl).pathname).expect(200);
      expect(await sharp(image.body as Buffer).metadata()).toMatchObject({
        width: 500,
        height: 44,
        format: "png",
      });
      expect(image.headers["cache-control"]).toBe("public, no-cache");
    }
    expect(runBody(await generate(requestId).expect(201)).runId).toBe(run.runId);
    expect(fakeTs.channelCreate).toHaveBeenCalledTimes(2);
    expect((await runs.list()).runs).toHaveLength(1);
    expect(await prisma.wallpaperRunRow.count({ where: { image: { not: null } } })).toBe(0);
  });

  it("rejects idempotency-key reuse for a different request", async () => {
    const requestId = randomUUID();
    await generate(requestId).expect(201);
    await generate(requestId, "Different").expect(409);
    expect(fakeTs.channelCreate).toHaveBeenCalledTimes(2);
  });

  it("keeps generated CIDs after a storage failure and resumes without duplicate channels", async () => {
    const spy = jest
      .spyOn(images, "saveImage")
      .mockRejectedValueOnce(new Error("Simulated disk write failure"));
    const response = await generate().expect(201);
    expect(runBody(response).status).toBe("partial-failure");
    expect(runBody(response).createdChannels).toHaveLength(1);
    spy.mockRestore();
    const resumed = await request(reqServer())
      .post("/images-local/channel-wallpaper/runs/" + runBody(response).runId + "/resume")
      .expect(201);
    expect(runBody(resumed).status).toBe("completed");
    expect(fakeTs.channelCreate).toHaveBeenCalledTimes(2);
  });

  it("recovers a crash after channel creation using its durable run marker", async () => {
    disconnectAfterCreate = true;
    const response = await generate().expect(201);
    expect(runBody(response).status).toBe("partial-failure");
    expect(channels.size).toBe(1);
    expect((await runs.resume(runBody(response).runId)).status).toBe("completed");
    expect(fakeTs.channelCreate).toHaveBeenCalledTimes(2);
  });

  it("never blindly creates again when a previous outcome cannot be reconciled", async () => {
    const prepared = await runs.prepare(randomUUID(), "hash", null, [
      { name: "Uncertain 1", depth: 0, isSpacer: false, image: png },
    ]);
    await prisma.wallpaperRunRow.update({
      where: { runId_position: { runId: prepared.runId, position: 0 } },
      data: { status: "uncertain" },
    });
    expect((await runs.resume(prepared.runId)).status).toBe("partial-failure");
    expect(fakeTs.channelCreate).not.toHaveBeenCalled();
  });

  it("undo removes child channels before parents, deletes images, and permits the same prefix again", async () => {
    const first = await generate(randomUUID(), "Wall", "nested-spacer").expect(201);
    const result = await request(reqServer())
      .post("/images-local/channel-wallpaper/undo")
      .send({ runId: runBody(first).runId })
      .expect(201);
    expect(undoBody(result).run.status).toBe("undone");
    expect(fakeTs.channelDelete).toHaveBeenNthCalledWith(1, "2", false);
    expect(fakeTs.channelDelete).toHaveBeenNthCalledWith(2, "1", false);
    expect(await prisma.channelImage.count()).toBe(0);
    expect((await runs.undo(runBody(first).runId)).deleted).toEqual([]);
    await generate(randomUUID(), "Wall", "nested-spacer").expect(201);
    expect(channels.size).toBe(2);
  });

  it("rejects arbitrary CIDs and retains occupied or modified channels for another undo attempt", async () => {
    await request(reqServer())
      .post("/images-local/channel-wallpaper/undo")
      .send({ cids: ["9"] })
      .expect(400);
    const response = await generate().expect(201);
    channels.get("2")!.occupied = true;
    const first = await runs.undo(runBody(response).runId);
    expect(first.run.status).toBe("undo-partial");
    expect(first.failed).toHaveLength(1);
    expect(await images.getImageByChannelId("2")).not.toBeNull();
    channels.get("2")!.occupied = false;
    channels.get("2")!.name = "Manually renamed";
    expect((await runs.undo(runBody(response).runId)).failed).toHaveLength(1);
    channels.get("2")!.name = "Wall spacer 1";
    expect((await runs.undo(runBody(response).runId)).run.status).toBe("undone");
  });

  it("preserves CID identity and old URLs across rename and explicitly rejects ambiguous old names", async () => {
    await images.syncChannels([{ cid: "11", name: "Old Name" }], true);
    await images.saveImage("Old Name", Buffer.from("legacy"), "image/png");
    const before = await prisma.channelImage.findFirst({ where: { channelName: "Old Name" } });
    await images.saveImage("Old Name", Buffer.from("updated"), "image/png", "11");
    const after = await prisma.channelImage.findUnique({ where: { channelId: "11" } });
    expect(after?.id).toBe(before?.id);
    await images.saveImage("Renamed", Buffer.from("new"), "image/png", "11");
    expect((await images.getImage("old-name"))?.image).toEqual(Buffer.from("new"));
    await images.saveImage("Röhre", Buffer.from("one"), "image/png", "12");
    await images.saveImage("Rohre", Buffer.from("two"), "image/png", "13");
    expect((await images.getImageByChannelId("12"))?.image).toEqual(Buffer.from("one"));
    expect((await images.getImageByChannelId("13"))?.image).toEqual(Buffer.from("two"));
    await request(reqServer()).get("/images/rohre.png").expect(409);
  });

  it("keeps spacer fallback under CID URLs and prunes only stale channel references", async () => {
    await images.saveImage("__spacer_base_image__", Buffer.from("base"), "image/png");
    await images.syncChannels(
      [
        { cid: "8", name: "spacer" },
        { cid: "9", name: "deleted" },
      ],
      true,
    );
    await images.saveImage("deleted", Buffer.from("retained"), "image/png", "9");
    await images.syncChannels([{ cid: "8", name: "spacer" }], true);
    expect(await prisma.channelReference.findUnique({ where: { cid: "9" } })).toBeNull();
    expect(await images.getImageByChannelId("9")).not.toBeNull();
    expect((await images.getPublicImageByChannelId("8"))?.image).toEqual(Buffer.from("base"));
  });

  it("lets the gallery delete a displayed legacy image through its channel-ID route", async () => {
    channels.set("80", {
      cid: "80",
      name: "Legacy Gallery",
      pid: null,
      bannerGfxUrl: "",
      description: "",
    });
    await images.saveImage("legacy-gallery", png, "image/png");
    const listed = await request(reqServer()).get("/images-local/channels").expect(200);
    expect(listed.body).toMatchObject({ items: [{ cid: "80", hasImage: true }] });
    await request(reqServer()).get("/images/by-id/80.png").expect(200);

    await request(reqServer()).delete("/images-local/channels/80/image").expect(200);

    await request(reqServer()).get("/images/by-id/80.png").expect(404);
    const refreshed = await request(reqServer()).get("/images-local/channels").expect(200);
    expect(refreshed.body).toMatchObject({ items: [{ cid: "80", hasImage: false }] });
  });

  it("reports stale running leases as resumable and refuses an active lease", async () => {
    const prepared = await runs.prepare(randomUUID(), "hash", null, [
      { name: "Lease 1", depth: 0, isSpacer: false, image: png },
    ]);
    await prisma.wallpaperRun.update({
      where: { id: prepared.runId },
      data: { status: "running", leaseToken: "other", leaseUntil: new Date(Date.now() + 60_000) },
    });
    await expect(runs.resume(prepared.runId)).rejects.toMatchObject({ status: 409 });
    await prisma.wallpaperRun.update({
      where: { id: prepared.runId },
      data: { leaseUntil: new Date(Date.now() - 1) },
    });
    expect((await runs.get(prepared.runId)).status).toBe("partial-failure");
    expect((await runs.resume(prepared.runId)).status).toBe("completed");
  });

  it("cannot resume a run that another process undoes between the precheck and lease claim", async () => {
    const prepared = await runs.prepare(randomUUID(), "hash", null, [
      { name: "Race 1", depth: 0, isSpacer: false, image: png },
    ]);
    const originalService = new ChannelWallpaperService(
      prisma,
      images,
      channelAccess as unknown as TeamSpeakChannelsService,
    );
    const spy = jest.spyOn(runs, "get").mockImplementationOnce(async (runId) => {
      const snapshot = await originalService.get(runId);
      await prisma.wallpaperRun.update({ where: { id: runId }, data: { status: "undone" } });
      return snapshot;
    });
    await expect(runs.resume(prepared.runId)).rejects.toMatchObject({ status: 409 });
    spy.mockRestore();
    expect(fakeTs.channelCreate).not.toHaveBeenCalled();
    expect((await runs.get(prepared.runId)).status).toBe("undone");
  });

  it("can undo a uniquely reconciled channel when the create response was lost", async () => {
    const prepared = await runs.prepare(randomUUID(), "hash", null, [
      { name: "Lost 1", depth: 0, isSpacer: false, image: png },
    ]);
    await prisma.wallpaperRunRow.update({
      where: { runId_position: { runId: prepared.runId, position: 0 } },
      data: { status: "uncertain" },
    });
    channels.set("70", {
      cid: "70",
      name: "Lost 1",
      pid: null,
      description: wallpaperMarker(prepared.runId, 0),
      bannerGfxUrl: wallpaperRowUrl(prepared.runId, 0, "https://example.test"),
    });
    expect((await runs.undo(prepared.runId)).run.status).toBe("undone");
    expect(fakeTs.channelDelete).toHaveBeenCalledWith("70", false);
  });

  it("keeps every unfinished run visible even after more than fifty newer finished runs", async () => {
    const open = await runs.prepare(randomUUID(), "hash", null, [
      { name: "Old pending", depth: 0, isSpacer: false, image: png },
    ]);
    await prisma.wallpaperRun.update({
      where: { id: open.runId },
      data: { createdAt: new Date("2020-01-01") },
    });
    await prisma.wallpaperRun.createMany({
      data: Array.from({ length: 55 }, (_, index) => ({
        requestId: randomUUID(),
        requestHash: "history",
        status: index % 2 ? "completed" : "undone",
        createdAt: new Date(Date.UTC(2021, 0, 1, index)),
      })),
    });
    const history = await runs.list();
    expect(history.runs).toHaveLength(51);
    expect(history.runs[0].runId).toBe(open.runId);
    expect(history.runs[0].status).toBe("pending");
    expect(history.runs.slice(1).every((run) => ["completed", "undone"].includes(run.status))).toBe(
      true,
    );
  });

  it("persists a reconciled CID before deleting so a lost deletion response remains recoverable", async () => {
    const prepared = await runs.prepare(randomUUID(), "hash", null, [
      { name: "Lost undo", depth: 0, isSpacer: false, image: png },
    ]);
    await prisma.wallpaperRunRow.update({
      where: { runId_position: { runId: prepared.runId, position: 0 } },
      data: { status: "uncertain" },
    });
    channels.set("70", {
      cid: "70",
      name: "Lost undo",
      pid: null,
      description: wallpaperMarker(prepared.runId, 0),
      bannerGfxUrl: wallpaperRowUrl(prepared.runId, 0, "https://example.test"),
    });
    await images.saveImage("Lost undo", png, "image/png", "70");
    fakeTs.channelDelete.mockImplementationOnce((cid) => {
      channels.delete(cid);
      return Promise.reject(new Error("Deletion response lost"));
    });
    expect((await runs.undo(prepared.runId)).run.status).toBe("undo-partial");
    const row = await prisma.wallpaperRunRow.findUnique({
      where: { runId_position: { runId: prepared.runId, position: 0 } },
    });
    expect(row?.cid).toBe("70");
    expect(row?.status).toBe("deleting");
    expect((await runs.undo(prepared.runId)).run.status).toBe("undone");
    expect(await images.getImageByChannelId("70")).toBeNull();
    expect(fakeTs.channelDelete).toHaveBeenCalledTimes(1);
  });

  it("does not delete a channel when another worker acquires the lease during ownership lookup", async () => {
    const prepared = await runs.prepare(randomUUID(), "hash", null, [
      { name: "Lease undo", depth: 0, isSpacer: false, image: png },
    ]);
    await runs.resume(prepared.runId);
    fakeTs.channelInfo.mockImplementationOnce(async (cid) => {
      await prisma.wallpaperRun.update({
        where: { id: prepared.runId },
        data: { leaseToken: "new-owner", leaseUntil: new Date(Date.now() + 60_000) },
      });
      return { channelDescription: channels.get(cid)?.description };
    });
    await runs.undo(prepared.runId);
    expect(fakeTs.channelDelete).not.toHaveBeenCalled();
    expect(channels.has("1")).toBe(true);
    expect(
      (await prisma.wallpaperRun.findUnique({ where: { id: prepared.runId } }))?.leaseToken,
    ).toBe("new-owner");
  });
});
