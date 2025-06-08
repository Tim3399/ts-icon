import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class ImagesService {
  constructor(private prisma: PrismaService) {}

  async getImage(channelName: string): Promise<{ image: Buffer; mimeType: string } | null> {
    const result = await this.prisma.channelImage.findUnique({
      where: { channelName },
      select: {
        image: true,
        mimeType: true,
      },
    });

    if (!result) return null;

    return {
      image: Buffer.from(result.image),
      mimeType: result.mimeType,
    };
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
