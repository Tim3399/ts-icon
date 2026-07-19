import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUrl, MaxLength } from 'class-validator';
import { MAX_CHANNEL_NAME_LENGTH } from './channel-name-validation.pipe';

const MAX_URL_LENGTH = 2048;

/**
 * Body for `POST images-local/from-url` — importing a channel banner from an
 * external image URL. `channelName`'s max length matches the `:channelName`
 * route parameter (see `ChannelNameValidationPipe`), since both ultimately
 * feed the same `normalizeChannelName()`/database-key path.
 */
export class ImageFromUrlDto {
  @ApiProperty({ example: 'my-channel', maxLength: MAX_CHANNEL_NAME_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_CHANNEL_NAME_LENGTH)
  channelName!: string;

  @ApiProperty({
    example: 'https://example.com/image.png',
    maxLength: MAX_URL_LENGTH,
  })
  @IsUrl()
  @IsNotEmpty()
  @MaxLength(MAX_URL_LENGTH)
  url!: string;
}
