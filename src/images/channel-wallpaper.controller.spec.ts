import "reflect-metadata";
import {
  BadRequestException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import type { Request } from "express";
import { ROLES_KEY } from "../auth/roles.decorator";
import { OIDC_ADMIN_ROLE } from "../../config";
import {
  ChannelWallpaperController,
  namesForRows,
  parseBackgroundColor,
  prepareRows,
  resolveSourceImage,
} from "./channel-wallpaper.controller";
import type { ChannelWallpaperService } from "./channel-wallpaper.service";
import type { MetricsService } from "../metrics/metrics.service";
import { fetchImageSafely, SsrfValidationError } from "./safe-url-fetcher";
import { TeamSpeakChannelsService } from "../teamspeak/teamspeak-channels";
import { sliceWallpaper } from "./wallpaper-slicer";
import { InvalidImageError } from "./image-processing";
import type { GenerateChannelWallpaperDto } from "./dto/generate-channel-wallpaper.dto";

jest.mock("./safe-url-fetcher", () => ({
  ...jest.requireActual<typeof import("./safe-url-fetcher")>("./safe-url-fetcher"),
  fetchImageSafely: jest.fn(),
}));
jest.mock("./wallpaper-slicer", () => ({
  ...jest.requireActual<typeof import("./wallpaper-slicer")>("./wallpaper-slicer"),
  sliceWallpaper: jest.fn(),
}));
const fetchLiveChannels = jest.fn<
  ReturnType<TeamSpeakChannelsService["fetchLiveChannels"]>,
  Parameters<TeamSpeakChannelsService["fetchLiveChannels"]>
>();
const channelAccess = { fetchLiveChannels } as unknown as TeamSpeakChannelsService;
const requestId = "e0ed8bc0-0d6c-4ae7-889a-38a5f45e7014";
const dto: GenerateChannelWallpaperDto = { requestId, namePrefix: "Wall", spacerMode: "flat" };
const file = { buffer: Buffer.from("image") } as Express.Multer.File;
const req = { user: { sub: "editor" } } as Request;
function fixture() {
  const result = { runId: requestId, status: "completed", createdChannels: [], rowCount: 0 };
  const runs = {
    existing: jest.fn().mockResolvedValue(null),
    prepare: jest.fn().mockResolvedValue(result),
    resume: jest.fn().mockResolvedValue(result),
    undo: jest.fn().mockResolvedValue({ deleted: [], failed: [], run: result }),
  };
  const metrics = { channelWallpaperGenerationsTotal: { inc: jest.fn() } };
  return {
    runs,
    result,
    controller: new ChannelWallpaperController(
      runs as unknown as ChannelWallpaperService,
      metrics as unknown as MetricsService,
      channelAccess,
    ),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(fetchLiveChannels).mockResolvedValue([]);
  jest
    .mocked(sliceWallpaper)
    .mockResolvedValue([{ row: { depth: 0, isSpacer: false }, image: Buffer.from("slice") }]);
});

describe("Wallpaper input preparation", () => {
  it("parses both RGB and RGBA and rejects malformed colors", () => {
    expect(parseBackgroundColor("#112233")).toEqual({ r: 17, g: 34, b: 51, alpha: 255 });
    expect(parseBackgroundColor("#11223380")?.alpha).toBe(128);
    expect(parseBackgroundColor()).toBeUndefined();
    expect(() => parseBackgroundColor("red")).toThrow(BadRequestException);
  });
  it("numbers art and spacer rows separately", () => {
    expect(
      namesForRows("Wall", [
        { depth: 0, isSpacer: false },
        { depth: 1, isSpacer: true },
        { depth: 0, isSpacer: false },
      ]),
    ).toEqual(["Wall 1", "Wall spacer 1", "Wall 2"]);
  });
  it("resolves parent depth and rejects a missing parent", async () => {
    const channels = [
      { cid: "1", name: "Root", pid: null, bannerGfxUrl: null },
      { cid: "2", name: "Child", pid: "1", bannerGfxUrl: null },
    ];
    expect((await prepareRows(channels, "2", "flat")).parentDepth).toBe(1);
    expect((await prepareRows(channels, undefined, "flat")).parentDepth).toBe(-1);
    await expect(prepareRows(channels, "3", "flat")).rejects.toBeInstanceOf(BadRequestException);
  });
  it("accepts exactly one image source and maps disallowed URLs to 400", async () => {
    await expect(resolveSourceImage(file, undefined)).resolves.toEqual(file.buffer);
    await expect(resolveSourceImage(file, "https://example.test/x.png")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(resolveSourceImage(undefined, undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    jest.mocked(fetchImageSafely).mockRejectedValue(new SsrfValidationError("Blocked"));
    await expect(resolveSourceImage(undefined, "https://127.0.0.1/x.png")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe("ChannelWallpaperController", () => {
  it("persists the prepared slices before asking the service to execute them", async () => {
    const { controller, runs, result } = fixture();
    expect(await controller.generate(file, dto, req)).toEqual(result);
    expect(runs.prepare).toHaveBeenCalledWith(
      requestId,
      expect.any(String),
      null,
      [{ name: "Wall 1", depth: 0, isSpacer: false, image: Buffer.from("slice") }],
      "editor",
    );
    expect(runs.resume).toHaveBeenCalledWith(requestId);
    expect(runs.prepare.mock.invocationCallOrder[0]).toBeLessThan(
      runs.resume.mock.invocationCallOrder[0],
    );
  });
  it("returns the previous durable result without rerendering or recreating on retry", async () => {
    const { controller, runs, result } = fixture();
    runs.existing.mockResolvedValue(result);
    expect(await controller.generate(file, dto, req)).toEqual(result);
    expect(sliceWallpaper).not.toHaveBeenCalled();
    expect(runs.prepare).not.toHaveBeenCalled();
  });
  it("requires a UUID idempotency key for generation", async () => {
    await expect(
      fixture().controller.generate(file, { ...dto, requestId: undefined }, req),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it("rejects zero rendered rows and corrupt source data before persistence", async () => {
    const { controller, runs } = fixture();
    jest.mocked(sliceWallpaper).mockResolvedValue([]);
    await expect(controller.generate(file, dto, req)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    jest.mocked(sliceWallpaper).mockRejectedValue(new InvalidImageError("Invalid"));
    await expect(controller.generate(file, dto, req)).rejects.toBeInstanceOf(
      UnsupportedMediaTypeException,
    );
    expect(runs.prepare).not.toHaveBeenCalled();
  });
  it("previews without creating a persistent run and applies absolute parent depth", async () => {
    const { controller, runs } = fixture();
    jest
      .mocked(fetchLiveChannels)
      .mockResolvedValue([{ cid: "1", name: "Parent", pid: null, bannerGfxUrl: null }]);
    const preview = await controller.preview(file, {
      ...dto,
      parentCid: "1",
      spacerMode: "nested-spacer",
    });
    expect(preview.rows[0]).toMatchObject({ depth: 0, isSpacer: false });
    expect(preview.rows[0].imageDataUrl).toContain("data:image/png;base64,");
    expect(jest.mocked(sliceWallpaper).mock.calls[0][1][0].depth).toBe(1);
    expect(jest.mocked(sliceWallpaper).mock.calls[0][1][1].depth).toBe(2);
    expect(runs.prepare).not.toHaveBeenCalled();
  });
  it("passes only the run ID to undo", async () => {
    const { controller, runs } = fixture();
    await controller.undo({ runId: requestId });
    expect(runs.undo).toHaveBeenCalledWith(requestId);
  });
  it("protects all generation, history, recovery and undo routes with the admin role", () => {
    for (const method of ["generate", "preview", "listRuns", "getRun", "resume", "undo"] as const) {
      expect(
        Reflect.getMetadata(
          ROLES_KEY,
          Reflect.get(ChannelWallpaperController.prototype, method) as object,
        ),
      ).toEqual([OIDC_ADMIN_ROLE]);
    }
  });
});
