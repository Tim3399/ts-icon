import type { TeamSpeak } from "ts3-nodejs-library";
import type { ChannelList } from "ts3-nodejs-library/lib/types/ResponseTypes";
import { createMockTeamSpeak, resetMockTeamSpeakState } from "./mock-teamspeak";

afterEach(() => {
  resetMockTeamSpeakState();
});

function list(ts3: TeamSpeak) {
  return ts3.execute<ChannelList>("channellist", ["-banners"]);
}

describe("createMockTeamSpeak", () => {
  it("lists the seeded channel tree in parent-before-child order", async () => {
    const ts3 = createMockTeamSpeak();
    const channels = await list(ts3);

    expect(channels.map((c) => c.channelName)).toEqual([
      "Welcome",
      "Lobby",
      "Gaming",
      "General Chat",
      "AFK",
      "Spacer 1",
    ]);
    const gaming = channels.find((c) => c.channelName === "Gaming")!;
    const generalChat = channels.find((c) => c.channelName === "General Chat")!;
    expect(generalChat.pid).toBe(gaming.cid);
  });

  it("creates a channel as a new top-level channel when cpid is omitted", async () => {
    const ts3 = createMockTeamSpeak();
    const created = await ts3.channelCreate("New Room", {});
    const found = (await list(ts3)).find((c) => c.cid === created.cid);

    expect(found?.channelName).toBe("New Room");
    expect(found?.pid).toBe("0");
  });

  it("creates a channel under a given parent (cpid)", async () => {
    const ts3 = createMockTeamSpeak();
    const gaming = (await list(ts3)).find((c) => c.channelName === "Gaming")!;

    const created = await ts3.channelCreate("New Subroom", { cpid: gaming.cid });

    expect((await list(ts3)).find((c) => c.cid === created.cid)?.pid).toBe(gaming.cid);
  });

  it("inserts a channel with no channelOrder first among its new siblings", async () => {
    const ts3 = createMockTeamSpeak();
    await ts3.channelCreate("Second", {});
    await ts3.channelCreate("First", {});

    const topLevelNames = (await list(ts3)).filter((c) => c.pid === "0").map((c) => c.channelName);

    expect(topLevelNames.slice(0, 2)).toEqual(["First", "Second"]);
  });

  it("inserts a channel right after a given orderAfterCid sibling", async () => {
    const ts3 = createMockTeamSpeak();
    const welcome = (await list(ts3)).find((c) => c.channelName === "Welcome")!;

    await ts3.channelCreate("Right After Welcome", { channelOrder: Number(welcome.cid) });
    const topLevelNames = (await list(ts3)).filter((c) => c.pid === "0").map((c) => c.channelName);

    expect(topLevelNames.indexOf("Right After Welcome")).toBe(topLevelNames.indexOf("Welcome") + 1);
  });

  it("sets channelBannerGfxUrl at creation time", async () => {
    const ts3 = createMockTeamSpeak();
    const created = await ts3.channelCreate("Bannered", {
      channelBannerGfxUrl: "https://example.test/images/bannered.png",
    });

    expect((await list(ts3)).find((c) => c.cid === created.cid)?.channelBannerGfxUrl).toBe(
      "https://example.test/images/bannered.png",
    );
  });

  it("updates a channel banner URL via channelEdit", async () => {
    const ts3 = createMockTeamSpeak();
    const welcome = (await list(ts3)).find((c) => c.channelName === "Welcome")!;

    await ts3.channelEdit(welcome.cid, {
      channelBannerGfxUrl: "https://example.test/images/welcome.png",
    });

    expect((await list(ts3)).find((c) => c.cid === welcome.cid)?.channelBannerGfxUrl).toBe(
      "https://example.test/images/welcome.png",
    );
  });

  it("rejects editing a cid that does not exist", async () => {
    const ts3 = createMockTeamSpeak();
    await expect(ts3.channelEdit("does-not-exist", { channelBannerGfxUrl: "x" })).rejects.toThrow(
      /no channel with cid/,
    );
  });

  it("stores the channel description at creation and returns it from channelInfo", async () => {
    const ts3 = createMockTeamSpeak();
    const created = await ts3.channelCreate("Marked", { channelDescription: "marker-1" });

    expect((await ts3.channelInfo(created.cid)).channelDescription).toBe("marker-1");
  });

  it("updates the description via channelEdit", async () => {
    const ts3 = createMockTeamSpeak();
    await ts3.channelEdit("1", { channelDescription: "edited" });

    expect((await ts3.channelInfo("1")).channelDescription).toBe("edited");
  });

  it("rejects channelInfo for an unknown cid", async () => {
    const ts3 = createMockTeamSpeak();
    await expect(ts3.channelInfo("does-not-exist")).rejects.toThrow(/no channel with cid/);
  });

  it("deletes a childless channel", async () => {
    const ts3 = createMockTeamSpeak();
    const afk = (await list(ts3)).find((c) => c.channelName === "AFK")!;

    await ts3.channelDelete(afk.cid, false);

    expect((await list(ts3)).find((c) => c.cid === afk.cid)).toBeUndefined();
  });

  it("refuses to delete a channel with subchannels unless force is set", async () => {
    const ts3 = createMockTeamSpeak();
    const gaming = (await list(ts3)).find((c) => c.channelName === "Gaming")!;

    await expect(ts3.channelDelete(gaming.cid, false)).rejects.toThrow(/subchannels/);
    expect((await list(ts3)).find((c) => c.cid === gaming.cid)).toBeDefined();
  });

  it("recursively deletes descendants when force is set", async () => {
    const ts3 = createMockTeamSpeak();
    const gaming = (await list(ts3)).find((c) => c.channelName === "Gaming")!;

    await ts3.channelDelete(gaming.cid, true);
    const names = (await list(ts3)).map((c) => c.channelName);

    expect(names).not.toContain("Gaming");
    expect(names).not.toContain("General Chat");
    expect(names).not.toContain("AFK");
  });

  it("rejects channelDelete for an unknown cid", async () => {
    const ts3 = createMockTeamSpeak();
    await expect(ts3.channelDelete("does-not-exist", false)).rejects.toThrow(/no channel with cid/);
  });

  it("rejects execute for commands other than channellist", async () => {
    const ts3 = createMockTeamSpeak();
    await expect(ts3.execute("serverinfo")).rejects.toThrow(/unsupported command/);
  });

  it("supports the transport lifecycle (on, connect, forceQuit)", async () => {
    const ts3 = createMockTeamSpeak();
    expect(ts3.on("error", () => undefined)).toBe(ts3);
    await expect(ts3.connect()).resolves.toBeDefined();
    expect(() => ts3.forceQuit()).not.toThrow();
  });

  it("quit() resolves without clearing state (state persists for the next connection)", async () => {
    const ts3 = createMockTeamSpeak();
    await ts3.channelCreate("Persisted", {});
    await ts3.quit();

    const channels = await list(createMockTeamSpeak());
    expect(channels.some((c) => c.channelName === "Persisted")).toBe(true);
  });
});
