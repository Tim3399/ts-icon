import { Injectable, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { DATABASE_URL } from '../../config'
import * as path from 'path'

function createAdapter() {
  // DATABASE_URL ist z.B. 'file:./dev.db' oder 'file:/data/dev.db'
  let dbPath = DATABASE_URL.replace(/^file:/, '')
  // Relative Pfade relativ zum prisma/-Ordner auflösen (wie Prisma CLI es tut)
  if (!path.isAbsolute(dbPath)) {
    dbPath = path.resolve(__dirname, '..', '..', '..', 'prisma', dbPath)
  }
  console.log('[Prisma] SQLite database path:', dbPath)
  return new PrismaBetterSqlite3({ url: dbPath })
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Buffer.isBuffer(value) && !Array.isArray(value)
}

function sanitizeArgs(args: unknown): unknown {
  if (Buffer.isBuffer(args)) {
    return `<Buffer (${args.length} bytes)>`
  }
  if (Array.isArray(args)) {
    return (args as unknown[]).map((item) => sanitizeArgs(item))
  }
  if (isPlainRecord(args)) {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(args)) {
      result[key] = sanitizeArgs(value)
    }
    return result
  }
  return args
}

function createPrismaClient() {
  const adapter = createAdapter()
  const client = new PrismaClient({ adapter })
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (['create', 'update', 'delete', 'upsert'].includes(operation)) {
            const sanitizedArgs = sanitizeArgs(args)
            console.log(`[Prisma] ${model}.${operation}`, sanitizedArgs)
          }
          return query(args)
        },
      },
    },
  })
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    super({ adapter: createAdapter() })
  }

  private readonly extended = createPrismaClient()

  get db() {
    return this.extended
  }

  async onModuleInit() {
    await this.$connect()
  }
}