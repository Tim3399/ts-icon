import { Injectable, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {

    this.$use(async (params, next) => {

      if (['create', 'update', 'delete', 'upsert'].includes(params.action)) {
        console.log(`[Prisma] ${params.model}.${params.action}`, params.args)
      }
      return next(params)
    })

    await this.$connect()
  }
}