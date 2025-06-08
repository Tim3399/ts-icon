import { Injectable, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

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

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    this.$use(async (params, next) => {
      if (['create', 'update', 'delete', 'upsert'].includes(params.action)) {
        const sanitizedArgs = sanitizeArgs(params.args)
        console.log(`[Prisma] ${params.model}.${params.action}`, sanitizedArgs)
      }
      return next(params)
    })

    await this.$connect()
  }
}