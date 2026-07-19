import { Logger } from '@nestjs/common';
import { TeamSpeak } from 'ts3-nodejs-library';
import {
  TS_HOST,
  TS_QUERY_PORT,
  TS_SERVER_PORT,
  getTeamSpeakCredentials,
} from '../../config';

const logger = new Logger('TeamSpeakChannels');

export interface LiveChannel {
  cid: string;
  name: string;
}

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
 * duplicated across call sites.
 */
export async function fetchLiveChannels(): Promise<LiveChannel[]> {
  logger.log('[fetchLiveChannels] Starting connection to TeamSpeak...');
  const { username, password } = getTeamSpeakCredentials();
  const ts3 = await TeamSpeak.connect({
    host: TS_HOST,
    queryport: TS_QUERY_PORT,
    serverport: TS_SERVER_PORT,
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
