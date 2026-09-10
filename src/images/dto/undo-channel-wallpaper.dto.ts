import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class UndoChannelWallpaperDto {
  @ApiProperty()
  @IsUUID()
  runId!: string;
}
