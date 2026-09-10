import { createServer, type Socket } from "node:net";
import { TeamSpeak } from "ts3-nodejs-library";
import { runTeamSpeakOperation, TeamSpeakTimeoutError } from "./teamspeak-transport";

function fakeConnection() {
  const client = new TeamSpeak({ autoConnect: false });
  jest.spyOn(client, "connect").mockResolvedValue(client);
  const quit = jest.spyOn(client, "quit").mockResolvedValue([]);
  const forceQuit = jest.spyOn(client, "forceQuit").mockImplementation(() => undefined);
  const execute = jest.spyOn(client, "execute").mockResolvedValue([]);
  return { client, quit, forceQuit, execute };
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it("aborts a connected but silent real RAW socket during the handshake", async () => {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test listener");
  const client = new TeamSpeak({ autoConnect: false, host: "127.0.0.1", queryport: address.port });
  client.on("error", () => undefined);
  const forceQuit = jest.spyOn(client, "forceQuit");
  const operation = jest.fn(() => Promise.resolve("unexpected"));
  try {
    await expect(
      runTeamSpeakOperation(client, operation, { commandMs: 30, operationMs: 1000 }),
    ).rejects.toBeInstanceOf(TeamSpeakTimeoutError);
    expect(forceQuit).toHaveBeenCalled();
    expect(operation).not.toHaveBeenCalled();
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it("closes a stalled command and blocks further commands even when its error is caught", async () => {
  jest.useFakeTimers();
  const { client, execute, forceQuit, quit } = fakeConnection();
  let rejectLate!: (error: Error) => void;
  execute.mockReturnValueOnce(
    new Promise((_, reject) => {
      rejectLate = reject;
    }),
  );
  let blocked = false;
  const pending = runTeamSpeakOperation(
    client,
    async (ts3) => {
      try {
        await ts3.channelDelete("42", false);
      } catch {
        /* Simulate a bulk handler. */
      }
      await expect(ts3.channelEdit("99", { channelName: "must not run" })).rejects.toBeInstanceOf(
        TeamSpeakTimeoutError,
      );
      blocked = true;
    },
    { commandMs: 20, operationMs: 180 },
  );
  const rejected = expect(pending).rejects.toBeInstanceOf(TeamSpeakTimeoutError);
  await jest.advanceTimersByTimeAsync(20);
  await rejected;
  rejectLate(new Error("late network rejection"));
  await Promise.resolve();
  expect(blocked).toBe(true);
  expect(execute).toHaveBeenCalledTimes(1);
  expect(forceQuit).toHaveBeenCalledTimes(1);
  expect(quit).not.toHaveBeenCalled();
});

it("bounds the entire operation across quick commands and blocks a late continuation", async () => {
  jest.useFakeTimers();
  const { client, execute, forceQuit } = fakeConnection();
  let release!: () => void;
  const pause = new Promise<void>((resolve) => {
    release = resolve;
  });
  let blocked = false;
  const pending = runTeamSpeakOperation(
    client,
    async (ts3) => {
      await ts3.channelDelete("42", false);
      await pause;
      await expect(ts3.channelDelete("99", false)).rejects.toBeInstanceOf(TeamSpeakTimeoutError);
      blocked = true;
    },
    { commandMs: 20, operationMs: 50 },
  );
  const rejected = expect(pending).rejects.toBeInstanceOf(TeamSpeakTimeoutError);
  await jest.advanceTimersByTimeAsync(50);
  await rejected;
  release();
  await jest.advanceTimersByTimeAsync(0);
  expect(blocked).toBe(true);
  expect(execute).toHaveBeenCalledTimes(1);
  expect(forceQuit).toHaveBeenCalledTimes(1);
});

it("preserves a successful result when graceful disconnect hangs and closes the client", async () => {
  jest.useFakeTimers();
  const { client, quit, forceQuit, execute } = fakeConnection();
  quit.mockReturnValueOnce(new Promise(() => undefined));
  const pending = runTeamSpeakOperation(client, () => Promise.resolve({ cid: "42" }), {
    disconnectMs: 10,
  });
  await jest.advanceTimersByTimeAsync(10);
  await expect(pending).resolves.toEqual({ cid: "42" });
  await expect(client.channelDelete("42", false)).rejects.toBeInstanceOf(TeamSpeakTimeoutError);
  expect(forceQuit).toHaveBeenCalledTimes(1);
  expect(execute).not.toHaveBeenCalled();
});

it("preserves the original failure if graceful disconnect also fails", async () => {
  const { client, quit, forceQuit } = fakeConnection();
  quit.mockRejectedValueOnce(new Error("disconnect failure"));
  await expect(
    runTeamSpeakOperation(client, () => Promise.reject(new Error("operation failure"))),
  ).rejects.toThrow("operation failure");
  expect(forceQuit).toHaveBeenCalledTimes(1);
});
