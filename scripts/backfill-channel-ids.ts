/**
 * One-time backfill: populates `ChannelImage.channelId` for rows that
 * predate that column, by matching each row's stored `channelName` against
 * the current live TeamSpeak channel list (via `normalizeChannelName`, the
 * same normalization the app already applies everywhere else).
 *
 * How to run:
 *
 *   npx ts-node scripts/backfill-channel-ids.ts
 *
 * or, equivalently, via the package.json script:
 *
 *   npm run backfill:channel-ids
 *
 * ---------------------------------------------------------------------
 * IMPORTANT: this connects to a REAL TeamSpeak server and a REAL database.
 *
 * It uses whichever TS_HOST/TS_QUERY_PORT/TS_SERVER_PORT/TS_USERNAME/
 * TS_USERPASSWORD and DATABASE_URL are set in the environment it runs in
 * (the same variables the rest of this app reads — see config.ts). There is
 * no dry-run flag: as soon as it finds a match, it writes that row's
 * channelId immediately.
 *
 * Before running this against a production TeamSpeak server / production
 * database, confirm those environment variables actually point at the
 * intended server and database, and review the printed summary (matched
 * rows, and any rows left unmatched) after it finishes. It is idempotent —
 * it only ever looks at rows where channelId is still NULL — so it's safe
 * to re-run if some rows were left unmatched (e.g. after manually renaming
 * a channel back, or investigating why a name didn't match).
 * ---------------------------------------------------------------------
 */
import 'dotenv/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { fetchLiveChannels } from '../src/teamspeak/teamspeak-channels';
import { matchChannelIdsToRows } from '../src/teamspeak/channel-id-matching';
import { DATABASE_URL } from '../config';

async function main(): Promise<void> {
  console.log('[backfill-channel-ids] Starting...');
  console.log(
    `[backfill-channel-ids] Target database (DATABASE_URL): ${DATABASE_URL}`,
  );
  console.log(
    '[backfill-channel-ids] Target TeamSpeak server is whatever TS_HOST/TS_QUERY_PORT/TS_SERVER_PORT currently resolve to in this environment — confirm this is the intended server before running against production data.',
  );

  const prisma = new PrismaService();
  await prisma.onModuleInit();

  try {
    const rows = await prisma.channelImage.findMany({
      where: { channelId: null },
      select: { channelName: true },
    });
    console.log(
      `[backfill-channel-ids] Found ${rows.length} row(s) with no channelId yet.`,
    );
    if (rows.length === 0) {
      console.log('[backfill-channel-ids] Nothing to do.');
      return;
    }

    const liveChannels = await fetchLiveChannels();
    console.log(
      `[backfill-channel-ids] Fetched ${liveChannels.length} live channel(s) from TeamSpeak.`,
    );

    const { matched, unmatched } = matchChannelIdsToRows(rows, liveChannels);

    for (const { channelName, channelId } of matched) {
      await prisma.channelImage.update({
        where: { channelName },
        data: { channelId },
      });
    }

    console.log('');
    console.log('[backfill-channel-ids] Summary');
    console.log('==============================');
    console.log(`Matched and updated: ${matched.length}`);
    for (const m of matched) {
      console.log(`  - ${m.channelName} -> channelId ${m.channelId}`);
    }
    console.log('');
    console.log(`Unmatched (left as channelId = NULL): ${unmatched.length}`);
    for (const name of unmatched) {
      console.log(`  - ${name}`);
    }
    if (unmatched.length > 0) {
      console.log('');
      console.log(
        '[backfill-channel-ids] The channel names above have no currently-live TeamSpeak channel matching them — most likely the channel was renamed or deleted since its image was uploaded. Review these manually; nothing destructive has been done to their rows.',
      );
    }
  } finally {
    await prisma.onModuleDestroy();
  }
}

main().catch((err: unknown) => {
  console.error('[backfill-channel-ids] Failed:', err);
  process.exitCode = 1;
});
