import { TeamSpeakChannelsService } from "../teamspeak/teamspeak-channels";
import { ImageImportService } from "./image-import.service";
import { Module } from "@nestjs/common";
import { ImagesLocalController } from "./images.controller.local";
import { ChannelWallpaperController } from "./channel-wallpaper.controller";
import { ChannelWallpaperService } from "./channel-wallpaper.service";
import { ImagesService } from "./images.service";
import { MetricsModule } from "../metrics/metrics.module";

@Module({
  imports: [MetricsModule],
  controllers: [ChannelWallpaperController, ImagesLocalController],
  providers: [ImagesService, ChannelWallpaperService, TeamSpeakChannelsService, ImageImportService],
})
export class ImagesModuleLocal {}
