import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class ImagesService {
  constructor(private prisma: PrismaService) {}

  getImage(channelName: string) {
    return this.prisma.channelImage.findUnique({
      where: { channelName },
    })
  }

  async saveImage(channelName: string, buffer: Buffer, mimeType: string) {
    await this.prisma.channelImage.upsert({
      where: { channelName },
      update: {
        image: buffer,
        mimeType: mimeType,
      },
      create: {
        channelName,
        image: buffer,
        mimeType: mimeType,
      },
    })
  }
}
