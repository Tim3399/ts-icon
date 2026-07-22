import { Logger } from '@nestjs/common';
import { TeamSpeak, QueryProtocol } from 'ts3-nodejs-library';
import {
  TS_HOST,
  TS_QUERY_PORT,
  TS_SERVER_PORT,
  TS_PROTOCOL,
  getTeamSpeakCredentials,
} from '../../config';
import type { TsProtocol } from '../../config';

const PROTOCOL_MAP: Record<
  TsProtocol,
  (typeof QueryProtocol)[keyof typeof QueryProtocol]
> = {
  raw: QueryProtocol.RAW,
  ssh: QueryProtocol.SSH,
};

const logger = new Logger('TeamSpeakChannels');

export interface LiveChannel {
  cid: string;
  name: string;
}

// Both the admin channel picker (GET /images-local/channels) and the
// upload-path channel resolution call fetchLiveChannels() per-request, so
// two requests arriving close together previously opened two independent
// TeamSpeak connections at once. Caching the in-flight promise here means
// concurrent callers share the one connection attempt already in progress
// instead of each opening their own; cleared once it settles (success or
// failure) so the *next* call, not concurrent with this one, starts a fresh
// connection rather than being stuck with a stale cached result forever.
let inFlightFetch: Promise<LiveChannel[]> | null = null;

/**
 * Connects to the TeamSpeak server configured via TS_HOST/TS_QUERY_PORT/
 * TS_SERVER_PORT and the ServerQuery credentials, fetches the current live
 * channel list (raw, un-normalized names plus each channel's stable ID),
 * and disconnects again.
 *
 * This is the one place that opens a TeamSpeak connection to list channels —
 * both the admin channel picker and the upload-path channel resolution call
 * it, and the one-time channel-ID backfill script does too, so there's a
 * single connect/list/disconnect implementation instead of the pattern being
 * duplicated across call sites. Concurrent calls are deduped into a single
 * in-flight connection attempt rather than each opening their own — see
 * `inFlightFetch` above.
 *
 * The transport (raw ServerQuery vs. SSH-tunneled ServerQuery) is
 * configurable via TS_PROTOCOL rather than hardcoded: some TeamSpeak
 * deployments only expose the SSH transport, even though the command set on
 * the wire is identical either way.
 */
export function fetchLiveChannels(): Promise<LiveChannel[]> {
  if (!inFlightFetch) {
    inFlightFetch = connectAndListChannels().finally(() => {
      inFlightFetch = null;
    });
  }
  return inFlightFetch;
}

async function connectAndListChannels(): Promise<LiveChannel[]> {
  logger.log('[fetchLiveChannels] Starting connection to TeamSpeak...');
  const { username, password } = getTeamSpeakCredentials();
  const ts3 = await TeamSpeak.connect({
    host: TS_HOST,
    queryport: TS_QUERY_PORT,
    serverport: TS_SERVER_PORT,
    protocol: PROTOCOL_MAP[TS_PROTOCOL],
    username,
    password,
  });

  ts3.on('error', (err) => {
    logger.error('[fetchLiveChannels] TeamSpeak client error:', err);
  });

  logger.log('[fetchLiveChannels] Connection to TeamSpeak established.');
  const channels = await ts3.channelList();
  const result = channels.map((c) => ({ cid: c.cid, name: c.name }));
  logger.log(`[fetchLiveChannels] Found ${result.length} channel(s).`);
  await ts3.quit();
  logger.log('[fetchLiveChannels] Connection to TeamSpeak closed.');
  return result;
}
