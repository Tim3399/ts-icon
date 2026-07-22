import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';
import { MAX_WALLPAPER_ROWS } from '../wallpaper-slicer';

/** Body for `POST images-local/channel-wallpaper/undo`. */
export class UndoChannelWallpaperDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_WALLPAPER_ROWS)
  @IsString({ each: true })
  cids!: string[];
}
