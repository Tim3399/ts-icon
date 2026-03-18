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

function sanitizeArgs(args: any): any {
  if (!args || typeof args !== 'object') return args
  const copy = Array.isArray(args) ? [...args] : { ...args }
  for (const key in copy) {
    if (Buffer.isBuffer(copy[key])) {
      copy[key] = `<Buffer (${copy[key].length} bytes)>`
    } else if (typeof copy[key] === 'object') {
      copy[key] = sanitizeArgs(copy[key])
    }
  }
  return copy
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