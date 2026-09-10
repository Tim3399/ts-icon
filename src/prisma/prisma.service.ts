import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { DATABASE_URL } from "../../config";
import { resolveSqlitePath } from "../../scripts/lib/sqlite-path";
import { MetricsService } from "../metrics/metrics.service";

const logger = new Logger("PrismaService");

function createAdapter() {
  // DATABASE_URL is e.g. 'file:./dev.db' or 'file:/data/dev.db'
  const dbPath = resolveSqlitePath(DATABASE_URL);
  // Resolve relative paths against the project root (process.cwd(), where
  // package.json/prisma/ live), not __dirname: __dirname's depth relative to
  // the project root differs between compiled output (dist/src/prisma) and
  // ts-jest running the TypeScript source directly (src/prisma), so a
  // fixed-depth "../../.." traversal from __dirname resolves to the wrong
  // directory depending on which one is running.
  return new PrismaBetterSqlite3({ url: dbPath });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && !Buffer.isBuffer(value) && !Array.isArray(value)
  );
}

export function sanitizeArgs(args: unknown): unknown {
  if (ArrayBuffer.isView(args) || args instanceof ArrayBuffer) {
    return `<Binary (${args.byteLength} bytes)>`;
  }
  if (args instanceof Date) return args.toISOString();
  if (Array.isArray(args)) {
    return (args as unknown[]).map((item) => sanitizeArgs(item));
  }
  if (isPlainRecord(args)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      result[key] = sanitizeArgs(value);
    }
    return result;
  }
  return args;
}

// Single PrismaClient instance (one adapter, one SQLite connection), extended
// once with query logging for mutating operations. Model delegates (e.g.
// `channelImage`) are forwarded from this one client via explicit getters on
// PrismaService below rather than a second, independently-connected client.
function createExtendedClient(metrics?: MetricsService) {
  const adapter = createAdapter();
  const client = new PrismaClient({ adapter });
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (["create", "update", "delete", "upsert"].includes(operation)) {
            const sanitizedArgs = sanitizeArgs(args);
            logger.log(`[Prisma] ${model}.${operation} ${JSON.stringify(sanitizedArgs)}`);
          }
          try {
            return await query(args);
          } catch (error) {
            metrics?.databaseErrorsTotal.inc({ operation: `${model}.${operation}` });
            throw error;
          }
        },
      },
    },
  });
}

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly client: ReturnType<typeof createExtendedClient>;

  constructor(@Optional() metrics?: MetricsService) {
    this.client = createExtendedClient(metrics);
  }

  // Forward model delegates used elsewhere in the codebase (e.g.
  // `ImagesService`'s `this.prisma.channelImage.findUnique(...)`) to the
  // single underlying client. Add another getter here if a new model is
  // introduced in prisma/schema.prisma.
  get channelImage() {
    return this.client.channelImage;
  }

  get channelImageAlias() {
    return this.client.channelImageAlias;
  }

  get channelReference() {
    return this.client.channelReference;
  }

  get wallpaperRun() {
    return this.client.wallpaperRun;
  }

  get wallpaperRunRow() {
    return this.client.wallpaperRunRow;
  }

  get $transaction() {
    return this.client.$transaction.bind(this.client) as typeof this.client.$transaction;
  }

  async onModuleInit() {
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
