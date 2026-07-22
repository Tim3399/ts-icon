import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';
import { MAX_CHANNEL_NAME_LENGTH } from './channel-name-validation.pipe';

const MAX_URL_LENGTH = 2048;

export type WallpaperSpacerMode = 'flat' | 'nested-spacer';

/**
 * Body for `POST images-local/channel-wallpaper` and its `/preview`
 * counterpart -- both take the same shape, since preview must run the exact
 * same slicing/depth logic generation will use. Multipart form fields all
 * arrive as strings, so numeric fields (`xOffset`/`yOffset`) rely on the
 * global `ValidationPipe`'s `transform: true` + `@Type(() => Number)` to
 * coerce them; `coverFitMode` is deliberately kept as a plain 'true'/'false'
 * string rather than transformed to a real boolean, since `Boolean('false')`
 * is `true` -- a footgun not worth the convenience.
 */
export class GenerateChannelWallpaperDto {
  @ApiPropertyOptional({
    description:
      'cid to parent the generated channels under; omitted/empty means top-level',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  parentCid?: string;

  @ApiProperty({ example: 'wallpaper-row', maxLength: MAX_CHANNEL_NAME_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_CHANNEL_NAME_LENGTH)
  namePrefix!: string;

  @ApiProperty({ enum: ['flat', 'nested-spacer'] })
  @IsIn(['flat', 'nested-spacer'])
  spacerMode!: WallpaperSpacerMode;

  @ApiPropertyOptional({
    description:
      'Alternative to uploading a file: fetch the source image from this URL instead.',
    maxLength: MAX_URL_LENGTH,
  })
  @IsOptional()
  @IsUrl()
  @MaxLength(MAX_URL_LENGTH)
  sourceImageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  xOffset?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  yOffset?: number;

  @ApiPropertyOptional({
    description: '#RRGGBB or #RRGGBBAA hex string; default fully transparent.',
    example: '#00000000',
  })
  @IsOptional()
  @IsString()
  @Matches(/^#?[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/)
  backgroundColor?: string;

  @ApiPropertyOptional({
    description:
      "'true' (default) or 'false' -- kept as a string, not a boolean, deliberately (see class doc).",
    enum: ['true', 'false'],
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  coverFitMode?: 'true' | 'false';
}
