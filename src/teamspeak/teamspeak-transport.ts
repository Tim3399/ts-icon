import type { TeamSpeak } from "ts3-nodejs-library";

export const TEAM_SPEAK_COMMAND_TIMEOUT_MS = 20_000;
export const TEAM_SPEAK_OPERATION_TIMEOUT_MS = 180_000;
const DISCONNECT_TIMEOUT_MS = 2_000;

export class TeamSpeakTimeoutError extends Error {
  constructor() {
    super("TeamSpeak did not respond in time; reload the operation status before retrying");
    this.name = "TeamSpeakTimeoutError";
  }
}

interface Limits {
  commandMs?: number;
  operationMs?: number;
  disconnectMs?: number;
}

type QueryResponse = Awaited<ReturnType<TeamSpeak["execute"]>>;

/** Owns one client for its complete lifetime, including an incomplete handshake. */
export async function runTeamSpeakOperation<T>(
  client: TeamSpeak,
  operation: (client: TeamSpeak) => Promise<T>,
  limits: Limits = {},
): Promise<T> {
  const commandMs = limits.commandMs ?? TEAM_SPEAK_COMMAND_TIMEOUT_MS;
  const operationMs = limits.operationMs ?? TEAM_SPEAK_OPERATION_TIMEOUT_MS;
  const disconnectMs = limits.disconnectMs ?? DISCONNECT_TIMEOUT_MS;
  const operationDeadline = Date.now() + operationMs;
  let stopped: Error | undefined;
  const pending = new Set<(error: Error) => void>();

  const stop = (error: Error) => {
    if (stopped) return;
    stopped = error;
    // Reject before closing: a synchronous socket close must not replace the
    // timeout with an unrelated library error or leave another command pending.
    for (const reject of [...pending]) reject(error);
    try {
      client.forceQuit();
    } catch {
      /* The connection may not yet have a socket. */
    }
  };

  const bounded = <R>(start: () => Promise<R>, timeoutMs?: number): Promise<R> => {
    if (Date.now() >= operationDeadline) stop(new TeamSpeakTimeoutError());
    if (stopped) return Promise.reject(stopped);
    const expiresAt = Math.min(operationDeadline, Date.now() + (timeoutMs ?? Infinity));
    return new Promise<R>((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (complete: () => void) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        pending.delete(abort);
        complete();
      };
      const abort = (error: Error) => finish(() => reject(error));
      pending.add(abort);
      if (timeoutMs !== undefined) {
        timer = setTimeout(() => stop(new TeamSpeakTimeoutError()), timeoutMs);
      }
      try {
        // Both branches stay attached even after abort, consuming late failures.
        Promise.resolve(start()).then(
          (value) => {
            if (Date.now() >= expiresAt) stop(new TeamSpeakTimeoutError());
            finish(() => resolve(value));
          },
          (error: unknown) =>
            finish(() =>
              reject(error instanceof Error ? error : new Error("TeamSpeak operation failed")),
            ),
        );
      } catch (error) {
        finish(() =>
          reject(error instanceof Error ? error : new Error("TeamSpeak operation failed")),
        );
      }
    });
  };

  // bind preserves execute's generic response contract, which TS loses when
  // strictBindCallApply is disabled in the consuming project.
  const execute = client.execute.bind(client) as TeamSpeak["execute"];
  client.execute = <R extends QueryResponse = []>(...args: Parameters<TeamSpeak["execute"]>) =>
    bounded(() => execute<R>(...args), commandMs);
  const deadline = setTimeout(() => stop(new TeamSpeakTimeoutError()), operationMs);
  try {
    await bounded(() => client.connect(), commandMs);
    return await bounded(() => operation(client));
  } finally {
    clearTimeout(deadline);
    if (!stopped) {
      // A failed graceful disconnect cannot replace the operation's result.
      try {
        await bounded(() => client.quit(), disconnectMs);
      } catch {
        /* Always force-close below; keep the original result/error. */
      }
      stop(new Error("TeamSpeak operation has finished"));
    }
  }
}
