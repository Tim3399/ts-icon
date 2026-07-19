import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUrl, MaxLength } from 'class-validator';

const MAX_URL_LENGTH = 2048;

/**
 * Query string for `GET images-local/img-from-url` — the SSRF-hardened
 * image proxy endpoint. Kept separate from `ImageFromUrlDto` even though
 * both carry a `url` field: one validates a query string, the other a JSON
 * body, and this endpoint has no `channelName` field to share.
 */
export class ImgFromUrlQueryDto {
  @ApiProperty({
    example: 'https://example.com/image.jpg',
    maxLength: MAX_URL_LENGTH,
  })
  @IsUrl()
  @IsNotEmpty()
  @MaxLength(MAX_URL_LENGTH)
  url!: string;
}
