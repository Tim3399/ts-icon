import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("database failure instrumentation with real SQLite", () => {
  const originalUrl = process.env.DATABASE_URL;
  let directory: string;
  let prisma: import("./prisma.service").PrismaService;
  let metrics: import("../metrics/metrics.service").MetricsService;

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), "ts-icon-metrics-"));
    const path = join(directory, "empty.db");
    writeFileSync(path, "");
    process.env.DATABASE_URL = "file:" + path.replace(/\\/g, "/");
    jest.resetModules();
    const { PrismaService } = await import("./prisma.service");
    const { MetricsService } = await import("../metrics/metrics.service");
    metrics = new MetricsService();
    prisma = new PrismaService(metrics);
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma?.onModuleDestroy();
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it("counts read and transactional write failures while preserving rejection", async () => {
    await expect(prisma.channelImage.findMany()).rejects.toThrow();
    await expect(
      prisma.$transaction(async (tx) => {
        return tx.channelImage.create({
          data: {
            channelName: "probe",
            image: new Uint8Array([1, 2]),
            mimeType: "image/png",
            size: 2,
            contentHash: "probe",
          },
        });
      }),
    ).rejects.toThrow();
    const { values } = await metrics.databaseErrorsTotal.get();
    expect(values.map(({ labels, value }) => [labels.operation, value]).sort()).toEqual([
      ["ChannelImage.create", 1],
      ["ChannelImage.findMany", 1],
    ]);
  });
});
