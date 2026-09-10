import "dotenv/config";
import * as path from "node:path";
import { PrismaService } from "../src/prisma/prisma.service";
import { TeamSpeakChannelsService } from "../src/teamspeak/teamspeak-channels";
import { normalizeChannelName } from "../src/util/util";
import { DATABASE_URL, TS_HOST } from "../config";
import { backupDatabase, checkDatabase } from "./db";
import { resolveSqlitePath } from "./lib/sqlite-path";
import { planBackfill } from "./lib/backfill-plan";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const databasePath = resolveSqlitePath(DATABASE_URL);
  checkDatabase(databasePath);
  console.log(
    JSON.stringify({ mode: apply ? "apply" : "dry-run", databasePath, teamSpeakHost: TS_HOST }),
  );
  const prisma = new PrismaService();
  await prisma.onModuleInit();
  try {
    const rows = await prisma.channelImage.findMany({
      select: {
        id: true,
        channelName: true,
        channelId: true,
        aliases: { select: { alias: true } },
      },
    });
    const channels = await new TeamSpeakChannelsService().fetchLiveChannels();
    const plan = planBackfill(rows, channels, normalizeChannelName);
    console.log(JSON.stringify(plan, null, 2));
    if (!apply || plan.updates.length === 0) {
      console.log("Database unchanged. Review conflicts; use --apply for the unambiguous rows.");
      return;
    }
    const backup = path.resolve(
      "backups",
      "before-backfill-" + new Date().toISOString().replace(/[:.]/g, "-") + ".db",
    );
    await backupDatabase(databasePath, backup);
    console.log("Verified backup: " + backup);
    for (const update of plan.updates) {
      const result = await prisma.channelImage.updateMany({
        where: { id: update.id, channelId: null },
        data: { channelId: update.channelId },
      });
      if (result.count !== 1) throw new Error("Row changed during backfill: " + update.id);
    }
    console.log("Applied " + plan.updates.length + " unambiguous assignments.");
  } finally {
    await prisma.onModuleDestroy();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
