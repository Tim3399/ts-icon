import { TeamSpeak } from "ts3-nodejs-library";
import { Test } from "@nestjs/testing";
import {
  TeamSpeakChannelsService,
  expectedBannerUrl,
  isManagedByUs,
  computeChannelDepth,
  withTeamSpeakConnection,
  type LiveChannel,
} from "./teamspeak-channels";

jest.mock("ts3-nodejs-library", () => {
  const connect = jest.fn<Promise<unknown>, [unknown]>();
  const MockTeamSpeak = Object.assign(
    jest.fn((config: unknown) => {
      const client = {
        on: jest.fn(),
        execute: jest.fn(),
        forceQuit: jest.fn(),
        connect: async () => {
          const ready = await connect(config);
          if (typeof ready === "object" && ready !== null) Object.assign(client, ready);
          return client;
        },
      };
      return client;
    }),
    { connect },
  );
  return { TeamSpeak: MockTeamSpeak, QueryProtocol: { RAW: "raw", SSH: "ssh" } };
});

jest.mock("../../config", () => ({
  ...jest.requireActual<typeof import("../../config")>("../../config"),
  getTeamSpeakCredentials: jest.fn(() => ({
    username: "user",
    password: "pass",
  })),
}));

// `jest.spyOn` (rather than a direct `TeamSpeak.connect` property read) avoids
// @typescript-eslint/unbound-method, matching the existing pattern in
// images.controller.local.spec.ts.
const mockedConnect = jest.spyOn(TeamSpeak, "connect");

let service: TeamSpeakChannelsService;

beforeEach(() => {
  service = new TeamSpeakChannelsService();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("fetchLiveChannels", () => {
  it("isolates cached and in-flight snapshots between Nest application contexts", async () => {
    const firstModule = await Test.createTestingModule({
      providers: [TeamSpeakChannelsService],
    }).compile();
    const secondModule = await Test.createTestingModule({
      providers: [TeamSpeakChannelsService],
    }).compile();
    try {
      const firstService = firstModule.get(TeamSpeakChannelsService);
      const secondService = secondModule.get(TeamSpeakChannelsService);
      expect(firstModule.get(TeamSpeakChannelsService)).toBe(firstService);
      expect(firstService).not.toBe(secondService);
      let release!: (channels: unknown[]) => void;
      const pending = new Promise<unknown[]>((resolve) => {
        release = resolve;
      });
      mockedConnect.mockResolvedValueOnce({
        on: jest.fn(),
        quit: jest.fn(),
        execute: () => pending,
      } as never);
      const first = firstService.fetchLiveChannels();
      await Promise.resolve();
      mockedConnect.mockResolvedValueOnce({
        on: jest.fn(),
        quit: jest.fn(),
        execute: () => Promise.resolve([{ cid: "2", channelName: "Second" }]),
      } as never);
      expect((await secondService.fetchLiveChannels())[0].cid).toBe("2");
      release([{ cid: "1", channelName: "First" }]);
      expect((await first)[0].cid).toBe("1");
      firstService.invalidateCache();
      expect((await secondService.fetchLiveChannels())[0].cid).toBe("2");
      expect(mockedConnect).toHaveBeenCalledTimes(2);
    } finally {
      await firstModule.close();
      await secondModule.close();
    }
  });
  it("does not let an invalidated in-flight response replace a newer cache entry", async () => {
    let release!: (channels: unknown[]) => void;
    const old = new Promise<unknown[]>((resolve) => {
      release = resolve;
    });
    mockedConnect.mockResolvedValueOnce({
      on: jest.fn(),
      quit: jest.fn(),
      execute: () => old,
    } as never);
    const first = service.fetchLiveChannels();
    await Promise.resolve();
    service.invalidateCache();
    mockedConnect.mockResolvedValueOnce({
      on: jest.fn(),
      quit: jest.fn(),
      execute: () => Promise.resolve([{ cid: "1", channelName: "New" }]),
    } as never);
    expect((await service.fetchLiveChannels())[0].name).toBe("New");
    release([{ cid: "1", channelName: "Old" }]);
    await first;
    expect((await service.fetchLiveChannels())[0].name).toBe("New");
    expect(mockedConnect).toHaveBeenCalledTimes(2);
  });
  it("returns the cid/name/bannerGfxUrl of every live channel, connects, and disconnects", async () => {
    const quit = jest.fn().mockResolvedValue(undefined);
    const fakeTeamSpeak = {
      on: jest.fn(),
      execute: jest.fn().mockResolvedValue([
        {
          cid: "1",
          channelName: "General",
          channelBannerGfxUrl: "https://example.test/images/general",
        },
        { cid: "2", channelName: "Music" },
      ]),
      quit,
    };
    mockedConnect.mockResolvedValue(fakeTeamSpeak as never);

    const result = await service.fetchLiveChannels();

    expect(result).toEqual([
      {
        cid: "1",
        name: "General",
        bannerGfxUrl: "https://example.test/images/general",
        pid: null,
      },
      { cid: "2", name: "Music", bannerGfxUrl: null, pid: null },
    ]);
    expect(quit).toHaveBeenCalledTimes(1);
    expect(fakeTeamSpeak.execute).toHaveBeenCalledWith("channellist", ["-banners"]);
  });

  it("propagates a connection failure rather than swallowing it", async () => {
    mockedConnect.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(service.fetchLiveChannels()).rejects.toThrow("ECONNREFUSED");
  });

  it("returns an empty array when no channels exist", async () => {
    const fakeTeamSpeak = {
      on: jest.fn(),
      execute: jest.fn().mockResolvedValue([]),
      quit: jest.fn().mockResolvedValue(undefined),
    };
    mockedConnect.mockResolvedValue(fakeTeamSpeak as never);

    const result = await service.fetchLiveChannels();

    expect(result).toEqual([]);
  });

  it("dedupes concurrent calls into a single connection attempt", async () => {
    let resolveConnect!: (value: unknown) => void;
    mockedConnect.mockReturnValue(
      new Promise((resolve) => {
        resolveConnect = resolve;
      }) as never,
    );

    // Both calls start before either has a chance to resolve, so if the
    // in-flight guard didn't exist, each would independently call
    // TeamSpeak.connect().
    const first = service.fetchLiveChannels();
    const second = service.fetchLiveChannels();

    const fakeTeamSpeak = {
      on: jest.fn(),
      execute: jest.fn().mockResolvedValue([{ cid: "1", channelName: "General" }]),
      quit: jest.fn().mockResolvedValue(undefined),
    };
    resolveConnect(fakeTeamSpeak);

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(mockedConnect).toHaveBeenCalledTimes(1);
    expect(firstResult).toEqual([{ cid: "1", name: "General", bannerGfxUrl: null, pid: null }]);
    expect(secondResult).toEqual(firstResult);
  });

  it("returns the cached result for a second call within the TTL, without reconnecting", async () => {
    const fakeTeamSpeak = {
      on: jest.fn(),
      execute: jest.fn().mockResolvedValue([{ cid: "1", channelName: "General" }]),
      quit: jest.fn().mockResolvedValue(undefined),
    };
    mockedConnect.mockResolvedValue(fakeTeamSpeak as never);

    const first = await service.fetchLiveChannels();
    const second = await service.fetchLiveChannels();

    expect(mockedConnect).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("starts a fresh connection once the cache TTL has expired", async () => {
    const fakeTeamSpeak = {
      on: jest.fn(),
      execute: jest.fn().mockResolvedValue([]),
      quit: jest.fn().mockResolvedValue(undefined),
    };
    mockedConnect.mockResolvedValue(fakeTeamSpeak as never);

    jest.useFakeTimers();
    try {
      await service.fetchLiveChannels();
      // 30_000ms is CACHE_TTL_MS -- advance strictly past it.
      jest.advanceTimersByTime(30_001);
      await service.fetchLiveChannels();
    } finally {
      jest.useRealTimers();
    }

    expect(mockedConnect).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed fetch, so the next call retries", async () => {
    mockedConnect.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(service.fetchLiveChannels()).rejects.toThrow("ECONNREFUSED");

    const fakeTeamSpeak = {
      on: jest.fn(),
      execute: jest.fn().mockResolvedValue([]),
      quit: jest.fn().mockResolvedValue(undefined),
    };
    mockedConnect.mockResolvedValueOnce(fakeTeamSpeak as never);

    const result = await service.fetchLiveChannels();

    expect(result).toEqual([]);
    expect(mockedConnect).toHaveBeenCalledTimes(2);
  });
});

const PUBLIC_BASE_URL = "https://ts-icon.example.test";

describe("expectedBannerUrl", () => {
  it("composes the public base URL with the normalized channel name under /images/, suffixed with .png", () => {
    // TeamSpeak 6 only renders a banner from a URL with a recognized image
    // file extension -- it doesn't consult Content-Type like a browser
    // does. Every stored image is always re-encoded to canonical PNG
    // regardless of what was uploaded, so this suffix is never a lie.
    expect(expectedBannerUrl("Röhre 1", PUBLIC_BASE_URL)).toBe(
      `${PUBLIC_BASE_URL}/images/rohre-1.png`,
    );
  });
});

describe("isManagedByUs", () => {
  it("recognizes a working legacy PNG URL for the channel's normalized name", () => {
    expect(
      isManagedByUs(
        {
          cid: "42",
          name: "Röhre 1",
          bannerGfxUrl: `${PUBLIC_BASE_URL}/images/rohre-1.png`,
          pid: null,
        },
        PUBLIC_BASE_URL,
      ),
    ).toBe(true);
  });

  it.each([
    `${PUBLIC_BASE_URL}/images/by-id/2.png`,
    `${PUBLIC_BASE_URL}/images/other.png`,
    "https://other.example/images/general.png",
  ])("rejects a URL for another channel or host: %s", (bannerGfxUrl) => {
    expect(
      isManagedByUs({ cid: "1", name: "General", bannerGfxUrl, pid: null }, PUBLIC_BASE_URL),
    ).toBe(false);
  });

  it("returns true when the channel banner already matches the expected URL", () => {
    const channel: LiveChannel = {
      cid: "1",
      name: "General",
      bannerGfxUrl: `${PUBLIC_BASE_URL}/images/by-id/1.png`,
      pid: null,
    };
    expect(isManagedByUs(channel, PUBLIC_BASE_URL)).toBe(true);
  });

  it("returns false when the channel has no banner set", () => {
    const channel: LiveChannel = {
      cid: "1",
      name: "General",
      bannerGfxUrl: null,
      pid: null,
    };
    expect(isManagedByUs(channel, PUBLIC_BASE_URL)).toBe(false);
  });

  it("returns false when the channel banner points somewhere else", () => {
    const channel: LiveChannel = {
      cid: "1",
      name: "General",
      bannerGfxUrl: "https://someone-elses-host.example/banner.png",
      pid: null,
    };
    expect(isManagedByUs(channel, PUBLIC_BASE_URL)).toBe(false);
  });

  it("returns false for the old, pre-fix extensionless URL, so applyBannerUrlsForAllChannels rewrites it", () => {
    // Regression coverage for the TS6-doesn't-render-extensionless-banners
    // bug: a channel still pointed at the URL shape expectedBannerUrl()
    // produced before it started appending .png must be treated as *not*
    // managed, so the existing "apply to every channel" bulk action is what
    // migrates it to the new, working URL -- no separate one-off migration
    // script needed.
    const channel: LiveChannel = {
      cid: "1",
      name: "General",
      bannerGfxUrl: `${PUBLIC_BASE_URL}/images/general`,
      pid: null,
    };
    expect(isManagedByUs(channel, PUBLIC_BASE_URL)).toBe(false);
  });
});

describe("computeChannelDepth", () => {
  const flatChannels: LiveChannel[] = [
    { cid: "1", name: "A", bannerGfxUrl: null, pid: null },
    { cid: "2", name: "B", bannerGfxUrl: null, pid: null },
  ];

  const nestedChannels: LiveChannel[] = [
    { cid: "1", name: "Root", bannerGfxUrl: null, pid: null },
    { cid: "2", name: "Child", bannerGfxUrl: null, pid: "1" },
    { cid: "3", name: "Grandchild", bannerGfxUrl: null, pid: "2" },
  ];

  it("returns -1 for a null cid (no parent chosen, i.e. top-level)", () => {
    expect(computeChannelDepth(null, flatChannels)).toBe(-1);
  });

  it("returns 0 for a top-level channel", () => {
    expect(computeChannelDepth("1", flatChannels)).toBe(0);
  });

  it("returns 0 for the root of a nested tree", () => {
    expect(computeChannelDepth("1", nestedChannels)).toBe(0);
  });

  it("returns 1 for a direct child", () => {
    expect(computeChannelDepth("2", nestedChannels)).toBe(1);
  });

  it("returns 2 for a grandchild", () => {
    expect(computeChannelDepth("3", nestedChannels)).toBe(2);
  });

  it("returns -1 for a cid that does not exist in the given channel list", () => {
    expect(computeChannelDepth("unknown", nestedChannels)).toBe(-1);
  });
});

describe("setChannelBannerUrl", () => {
  it("preserves a successful mutation when disconnecting fails", async () => {
    const forceQuit = jest.fn();
    mockedConnect.mockResolvedValueOnce({
      on: jest.fn(),
      quit: jest.fn().mockRejectedValue(new Error("socket closed")),
      forceQuit,
    } as never);
    await expect(withTeamSpeakConnection(() => Promise.resolve({ cid: "42" }))).resolves.toEqual({
      cid: "42",
    });
    expect(forceQuit).toHaveBeenCalledTimes(1);
  });

  it("preserves the original operation error when disconnecting also fails", async () => {
    mockedConnect.mockResolvedValueOnce({
      on: jest.fn(),
      quit: jest.fn().mockRejectedValue(new Error("quit failure")),
      forceQuit: jest.fn(),
    } as never);
    await expect(
      withTeamSpeakConnection(() => Promise.reject(new Error("mutation failure"))),
    ).rejects.toThrow("mutation failure");
  });
  it("connects, calls channelEdit with the given cid/url, and disconnects", async () => {
    const quit = jest.fn().mockResolvedValue(undefined);
    const channelEdit = jest.fn().mockResolvedValue([]);
    const fakeTeamSpeak = { on: jest.fn(), channelEdit, quit };
    mockedConnect.mockResolvedValue(fakeTeamSpeak as never);

    await service.setChannelBannerUrl("42", `${PUBLIC_BASE_URL}/images/general`);

    expect(channelEdit).toHaveBeenCalledWith("42", {
      channelBannerGfxUrl: `${PUBLIC_BASE_URL}/images/general`,
    });
    expect(quit).toHaveBeenCalledTimes(1);
  });

  it("still disconnects if channelEdit itself fails", async () => {
    const quit = jest.fn().mockResolvedValue(undefined);
    const channelEdit = jest.fn().mockRejectedValue(new Error("rejected by server"));
    const fakeTeamSpeak = { on: jest.fn(), channelEdit, quit };
    mockedConnect.mockResolvedValue(fakeTeamSpeak as never);

    await expect(service.setChannelBannerUrl("42", "https://x.test/images/y")).rejects.toThrow(
      "rejected by server",
    );
    expect(quit).toHaveBeenCalledTimes(1);
  });

  it("invalidates the live-channels cache, so a refresh right after reflects the new banner URL", async () => {
    // Regression test: service.setChannelBannerUrl() used to leave service.fetchLiveChannels()'s
    // cache untouched, so the normal admin-UI workflow of "set banner URL,
    // then refresh the channel list" showed the *pre-update* bannerGfxUrl
    // (and therefore `managed: false`) for up to CACHE_TTL_MS after a
    // successful update.
    mockedConnect.mockResolvedValueOnce({
      on: jest.fn(),
      execute: jest
        .fn()
        .mockResolvedValue([{ cid: "42", channelName: "general", channelBannerGfxUrl: null }]),
      quit: jest.fn().mockResolvedValue(undefined),
    } as never);
    const cachedBefore = await service.fetchLiveChannels();
    expect(cachedBefore[0].bannerGfxUrl).toBeNull();

    mockedConnect.mockResolvedValueOnce({
      on: jest.fn(),
      channelEdit: jest.fn().mockResolvedValue([]),
      quit: jest.fn().mockResolvedValue(undefined),
    } as never);
    await service.setChannelBannerUrl("42", `${PUBLIC_BASE_URL}/images/general`);

    mockedConnect.mockResolvedValueOnce({
      on: jest.fn(),
      execute: jest.fn().mockResolvedValue([
        {
          cid: "42",
          channelName: "general",
          channelBannerGfxUrl: `${PUBLIC_BASE_URL}/images/general`,
        },
      ]),
      quit: jest.fn().mockResolvedValue(undefined),
    } as never);
    const refreshed = await service.fetchLiveChannels();

    expect(mockedConnect).toHaveBeenCalledTimes(3);
    expect(refreshed[0].bannerGfxUrl).toBe(`${PUBLIC_BASE_URL}/images/general`);
  });
});

describe("applyBannerUrlsForAllChannels", () => {
  it("reports partial failures while preserving successfully updated channels", async () => {
    const channelEdit = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("permission denied"));
    mockedConnect.mockResolvedValueOnce({
      on: jest.fn(),
      quit: jest.fn(),
      execute: () =>
        Promise.resolve([
          { cid: "1", channelName: "A" },
          { cid: "2", channelName: "B" },
        ]),
      channelEdit,
    } as never);
    const result = await service.applyBannerUrlsForAllChannels(PUBLIC_BASE_URL);
    expect(result.updated).toEqual(["A"]);
    expect(result.failed).toEqual([{ cid: "2", error: "permission denied" }]);
  });
  it("updates only channels not already managed, leaving the rest alone", async () => {
    const channelEdit = jest.fn().mockResolvedValue([]);
    const fakeTeamSpeak = {
      on: jest.fn(),
      execute: jest.fn().mockResolvedValue([
        {
          cid: "1",
          channelName: "General",
          channelBannerGfxUrl: `${PUBLIC_BASE_URL}/images/by-id/1.png`,
        },
        { cid: "2", channelName: "Music", channelBannerGfxUrl: null },
        {
          cid: "3",
          channelName: "Röhre",
          channelBannerGfxUrl: "https://elsewhere.test/x.png",
        },
        {
          cid: "4",
          channelName: "[spacer20]",
          channelBannerGfxUrl: `${PUBLIC_BASE_URL}/images/spacer20.png`,
        },
      ]),
      channelEdit,
      quit: jest.fn().mockResolvedValue(undefined),
    };
    mockedConnect.mockResolvedValue(fakeTeamSpeak as never);

    const result = await service.applyBannerUrlsForAllChannels(PUBLIC_BASE_URL);

    expect(result.alreadyManaged).toEqual(["General", "[spacer20]"]);
    expect(result.updated).toEqual(["Music", "Röhre"]);
    expect(channelEdit).toHaveBeenCalledTimes(2);
    expect(channelEdit).toHaveBeenCalledWith("2", {
      channelBannerGfxUrl: `${PUBLIC_BASE_URL}/images/by-id/2.png`,
    });
    expect(channelEdit).toHaveBeenCalledWith("3", {
      channelBannerGfxUrl: `${PUBLIC_BASE_URL}/images/by-id/3.png`,
    });
  });

  it("uses a single connection for the whole batch", async () => {
    const fakeTeamSpeak = {
      on: jest.fn(),
      execute: jest.fn().mockResolvedValue([
        { cid: "1", channelName: "A", channelBannerGfxUrl: null },
        { cid: "2", channelName: "B", channelBannerGfxUrl: null },
      ]),
      channelEdit: jest.fn().mockResolvedValue([]),
      quit: jest.fn().mockResolvedValue(undefined),
    };
    mockedConnect.mockResolvedValue(fakeTeamSpeak as never);

    await service.applyBannerUrlsForAllChannels(PUBLIC_BASE_URL);

    expect(mockedConnect).toHaveBeenCalledTimes(1);
  });

  it("returns empty arrays when there are no live channels", async () => {
    const fakeTeamSpeak = {
      on: jest.fn(),
      execute: jest.fn().mockResolvedValue([]),
      channelEdit: jest.fn(),
      quit: jest.fn().mockResolvedValue(undefined),
    };
    mockedConnect.mockResolvedValue(fakeTeamSpeak as never);

    const result = await service.applyBannerUrlsForAllChannels(PUBLIC_BASE_URL);

    expect(result).toEqual({ updated: [], alreadyManaged: [], failed: [] });
  });

  it("invalidates the live-channels cache, so a refresh right after reflects the newly-applied banner URLs", async () => {
    mockedConnect.mockResolvedValueOnce({
      on: jest.fn(),
      execute: jest
        .fn()
        .mockResolvedValue([{ cid: "1", channelName: "general", channelBannerGfxUrl: null }]),
      quit: jest.fn().mockResolvedValue(undefined),
    } as never);
    const cachedBefore = await service.fetchLiveChannels();
    expect(cachedBefore[0].bannerGfxUrl).toBeNull();

    mockedConnect.mockResolvedValueOnce({
      on: jest.fn(),
      execute: jest
        .fn()
        .mockResolvedValue([{ cid: "1", channelName: "general", channelBannerGfxUrl: null }]),
      channelEdit: jest.fn().mockResolvedValue([]),
      quit: jest.fn().mockResolvedValue(undefined),
    } as never);
    await service.applyBannerUrlsForAllChannels(PUBLIC_BASE_URL);

    mockedConnect.mockResolvedValueOnce({
      on: jest.fn(),
      execute: jest.fn().mockResolvedValue([
        {
          cid: "1",
          channelName: "general",
          channelBannerGfxUrl: `${PUBLIC_BASE_URL}/images/general`,
        },
      ]),
      quit: jest.fn().mockResolvedValue(undefined),
    } as never);
    const refreshed = await service.fetchLiveChannels();

    expect(mockedConnect).toHaveBeenCalledTimes(3);
    expect(refreshed[0].bannerGfxUrl).toBe(`${PUBLIC_BASE_URL}/images/general`);
  });
});
