import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { DATABASE_URL } from '../../config';
import * as path from 'path';

const logger = new Logger('PrismaService');

function createAdapter() {
  // DATABASE_URL is e.g. 'file:./dev.db' or 'file:/data/dev.db'
  let dbPath = DATABASE_URL.replace(/^file:/, '');
  // Resolve relative paths against the project root (process.cwd(), where
  // package.json/prisma/ live), not __dirname: __dirname's depth relative to
  // the project root differs between compiled output (dist/src/prisma) and
  // ts-jest running the TypeScript source directly (src/prisma), so a
  // fixed-depth "../../.." traversal from __dirname resolves to the wrong
  // directory depending on which one is running.
  if (!path.isAbsolute(dbPath)) {
    dbPath = path.resolve(process.cwd(), 'prisma', dbPath);
  }
  return new PrismaBetterSqlite3({ url: dbPath });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Buffer.isBuffer(value) &&
    !Array.isArray(value)
  );
}

function sanitizeArgs(args: unknown): unknown {
  if (Buffer.isBuffer(args)) {
    return `<Buffer (${args.length} bytes)>`;
  }
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
function createExtendedClient() {
  const adapter = createAdapter();
  const client = new PrismaClient({ adapter });
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (['create', 'update', 'delete', 'upsert'].includes(operation)) {
            const sanitizedArgs = sanitizeArgs(args);
            logger.log(
              `[Prisma] ${model}.${operation} ${JSON.stringify(sanitizedArgs)}`,
            );
          }
          return query(args);
        },
      },
    },
  });
}

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly client = createExtendedClient();

  // Forward model delegates used elsewhere in the codebase (e.g.
  // `ImagesService`'s `this.prisma.channelImage.findUnique(...)`) to the
  // single underlying client. Add another getter here if a new model is
  // introduced in prisma/schema.prisma.
  get channelImage() {
    return this.client.channelImage;
  }

  async onModuleInit() {
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
