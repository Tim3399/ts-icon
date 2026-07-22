import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Express, Request } from 'express';

import { OIDC_ADMIN_ROLE, getPublicBaseUrl } from '../../config';
import { Roles } from '../auth/roles.decorator';
import {
  AuditAction,
  AuditLoggingInterceptor,
} from './audit-logging.interceptor';
import { ImagesService } from './images.service';
import { MetricsService } from '../metrics/metrics.service';
import { imageFileFilter } from './images.controller.local';
import { fetchImageSafely, FetchFailedError } from './safe-url-fetcher';
import {
  InvalidImageError,
  ImageTooLargeError,
  OUTPUT_MIME_TYPE,
} from './image-processing';
import {
  buildAlternatingRowPlan,
  sliceWallpaper,
  MAX_WALLPAPER_ROWS,
  type WallpaperRow,
  type WallpaperBackgroundColor,
} from './wallpaper-slicer';
import {
  fetchLiveChannels,
  computeChannelDepth,
  expectedBannerUrl,
  listChannelsOnConnection,
  withTeamSpeakConnection,
  invalidateLiveChannelsCache,
} from '../teamspeak/teamspeak-channels';
import {
  createChannelWallpaper,
  deleteManagedChannels,
  type WallpaperChannelSlice,
} from '../teamspeak/teamspeak-channel-admin';
import { GenerateChannelWallpaperDto } from './dto/generate-channel-wallpaper.dto';
import { UndoChannelWallpaperDto } from './dto/undo-channel-wallpaper.dto';

const logger = new Logger('ChannelWallpaperController');

// Wallpaper source images can legitimately be tall/detailed (many rows'
// worth of artwork in one file), so this is deliberately more generous than
// the 5MB cap on a single 500x44 banner upload in images.controller.local.ts.
const MAX_WALLPAPER_FILE_SIZE = 20 * 1024 * 1024;

export function parseBackgroundColor(
  hex?: string,
): WallpaperBackgroundColor | undefined {
  if (!hex) return undefined;
  // Already shape-validated by the DTO's @Matches, but re-checked here since
  // this function has to actually pull the hex apart into channels.
  const match = /^#?([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(hex);
  if (!match) {
    throw new BadRequestException(
      'backgroundColor must be a #RRGGBB or #RRGGBBAA hex string',
    );
  }
  const [, rgb, alphaHex] = match;
  return {
    r: parseInt(rgb.slice(0, 2), 16),
    g: parseInt(rgb.slice(2, 4), 16),
    b: parseInt(rgb.slice(4, 6), 16),
    alpha: alphaHex ? parseInt(alphaHex, 16) : 255,
  };
}

/** Art rows and spacer rows are numbered independently, e.g. "Prefix 1", "Prefix spacer 1", "Prefix 2", ... */
export function namesForRows(
  namePrefix: string,
  rows: WallpaperRow[],
): string[] {
  let artIndex = 0;
  let spacerIndex = 0;
  return rows.map((row) => {
    if (row.isSpacer) {
      spacerIndex += 1;
      return `${namePrefix} spacer ${spacerIndex}`;
    }
    artIndex += 1;
    return `${namePrefix} ${artIndex}`;
  });
}

export async function resolveSourceImage(
  file: Express.Multer.File | undefined,
  sourceImageUrl: string | undefined,
): Promise<Buffer> {
  if (file && sourceImageUrl) {
    throw new BadRequestException(
      'Provide either a file upload or sourceImageUrl, not both',
    );
  }
  if (file?.buffer) {
    return file.buffer;
  }
  if (sourceImageUrl) {
    try {
      const { buffer } = await fetchImageSafely(sourceImageUrl);
      return buffer;
    } catch (err) {
      if (err instanceof FetchFailedError) {
        throw new UnprocessableEntityException(err.message);
      }
      throw err;
    }
  }
  throw new BadRequestException(
    'Provide either a file upload or sourceImageUrl',
  );
}

interface PreparedRows {
  relativeRows: WallpaperRow[];
  parentDepth: number;
}

/**
 * Resolves the chosen parent channel's depth in the live tree (-1 for
 * top-level) and validates it actually exists, then hands back the
 * candidate row plan -- still relative to that parent (0 = direct child).
 * `sliceWallpaper()` needs *absolute* depth for correct pixel-offset math
 * (nesting under an already-deep parent shifts the artwork further right
 * than nesting at the top level would), so callers combine `parentDepth`
 * back in themselves; `createChannelWallpaper()` needs the relative depth
 * as-is, since it reconstructs cpid chains starting from the given parent.
 *
 * Deliberately `async` despite having no internal `await`: an invalid
 * `parentCid` should reject the returned promise rather than throw
 * synchronously, matching every other validation step in the two callers
 * that do have real awaits around this one.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function prepareRows(
  channels: {
    cid: string;
    pid: string | null;
    name: string;
    bannerGfxUrl: string | null;
  }[],
  parentCid: string | undefined,
  spacerMode: 'flat' | 'nested-spacer',
): Promise<PreparedRows> {
  const normalizedParentCid = parentCid?.trim() || null;
  if (
    normalizedParentCid !== null &&
    !channels.some((c) => c.cid === normalizedParentCid)
  ) {
    throw new BadRequestException(
      `parentCid "${normalizedParentCid}" does not match any live channel`,
    );
  }
  const parentDepth = computeChannelDepth(normalizedParentCid, channels);
  const relativeRows = buildAlternatingRowPlan(MAX_WALLPAPER_ROWS, spacerMode);
  return { relativeRows, parentDepth };
}

export interface CreatedWallpaperChannelDto {
  cid: string;
  name: string;
  kind: 'art' | 'spacer';
  depth: number;
}

@ApiTags('images-local')
@Controller('images-local/channel-wallpaper')
export class ChannelWallpaperController {
  private readonly publicBaseUrl = getPublicBaseUrl();

  constructor(
    private readonly imagesService: ImagesService,
    private readonly metrics: MetricsService,
  ) {}

  @Post()
  @Roles(OIDC_ADMIN_ROLE)
  @AuditAction('generate-channel-wallpaper')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_WALLPAPER_FILE_SIZE },
      fileFilter: imageFileFilter,
    }),
    AuditLoggingInterceptor,
  )
  @ApiOperation({
    summary:
      'Slices one large image across an auto-created channel tree and points each new channel banner at its slice (admin only)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: GenerateChannelWallpaperDto })
  async generate(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: GenerateChannelWallpaperDto,
    @Req() req: Request,
  ) {
    const sourceBuffer = await resolveSourceImage(file, dto.sourceImageUrl);
    const backgroundColor = parseBackgroundColor(dto.backgroundColor);
    const coverFitMode = dto.coverFitMode !== 'false';
    const normalizedParentCid = dto.parentCid?.trim() || null;

    try {
      const result = await withTeamSpeakConnection(async (ts3) => {
        const channels = await listChannelsOnConnection(ts3);
        const { relativeRows, parentDepth } = await prepareRows(
          channels,
          dto.parentCid,
          dto.spacerMode,
        );

        // sliceWallpaper() needs the row's *absolute* tree depth for
        // correct pixel-offset math -- createChannelWallpaper() below
        // needs the depth relative to parentCid, so both are derived from
        // the same relativeRows array rather than one computed from the
        // other after the fact.
        const absoluteRows = relativeRows.map((r) => ({
          ...r,
          depth: parentDepth + 1 + r.depth,
        }));

        let slices;
        try {
          slices = await sliceWallpaper(sourceBuffer, absoluteRows, {
            xOffset: dto.xOffset,
            yOffset: dto.yOffset,
            backgroundColor,
            coverFitMode,
          });
        } catch (err) {
          if (err instanceof InvalidImageError) {
            throw new UnsupportedMediaTypeException(err.message);
          }
          if (err instanceof ImageTooLargeError) {
            throw new UnprocessableEntityException(err.message);
          }
          throw err;
        }

        // Truncation only depends on how many rows fit by height, never on
        // depth, so the first slices.length entries of relativeRows line
        // up 1:1 with the truncated slices array by position.
        const relativeRowsUsed = relativeRows.slice(0, slices.length);
        const names = namesForRows(dto.namePrefix, relativeRowsUsed);

        const collisions: string[] = [];
        for (const name of names) {
          if (await this.imagesService.channelNameInUse(name)) {
            collisions.push(name);
          }
        }
        if (collisions.length > 0) {
          throw new ConflictException(
            `Channel name(s) already in use: ${collisions.join(', ')}`,
          );
        }

        const wallpaperSlices: WallpaperChannelSlice[] = slices.map(
          (slice, i) => ({
            name: names[i],
            bannerUrl: expectedBannerUrl(names[i], this.publicBaseUrl),
            depth: relativeRowsUsed[i].depth,
            isSpacer: relativeRowsUsed[i].isSpacer,
          }),
        );

        const createResult = await createChannelWallpaper(
          ts3,
          normalizedParentCid,
          wallpaperSlices,
        );

        // Store each successfully created channel's image, in the same
        // order -- a row whose channel creation itself failed (covered by
        // createResult.failedAt) never gets this far.
        for (let i = 0; i < createResult.created.length; i++) {
          const created = createResult.created[i];
          await this.imagesService.saveImage(
            created.name,
            slices[i].image,
            OUTPUT_MIME_TYPE,
            created.cid,
            req.user?.sub,
          );
        }

        return createResult;
      });

      invalidateLiveChannelsCache();

      const createdChannels: CreatedWallpaperChannelDto[] = result.created.map(
        (c) => ({
          cid: c.cid,
          name: c.name,
          kind: c.isSpacer ? 'spacer' : 'art',
          depth: c.depth,
        }),
      );

      const outcome = result.failedAt
        ? 'partial-failure'
        : createdChannels.length > 0
          ? 'success'
          : 'failure';
      this.metrics.channelWallpaperGenerationsTotal.inc({ result: outcome });

      return {
        createdChannels,
        rowCount: createdChannels.length,
        ...(result.failedAt ? { failedAt: result.failedAt } : {}),
      };
    } catch (err) {
      if (
        err instanceof BadRequestException ||
        err instanceof ConflictException ||
        err instanceof UnsupportedMediaTypeException ||
        err instanceof UnprocessableEntityException
      ) {
        this.metrics.channelWallpaperGenerationsTotal.inc({
          result: 'failure',
        });
        throw err;
      }
      logger.error('[generate] Unexpected error:', err);
      this.metrics.teamspeakErrorsTotal.inc({
        operation: 'generate-channel-wallpaper',
      });
      this.metrics.channelWallpaperGenerationsTotal.inc({ result: 'failure' });
      throw new ServiceUnavailableException(
        'TeamSpeak is currently unreachable',
      );
    }
  }

  @Post('preview')
  @Roles(OIDC_ADMIN_ROLE)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_WALLPAPER_FILE_SIZE },
      fileFilter: imageFileFilter,
    }),
  )
  @ApiOperation({
    summary:
      'Runs the same slicing logic as generation, without touching TeamSpeak or storage, for a live preview (admin only)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: GenerateChannelWallpaperDto })
  async preview(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: GenerateChannelWallpaperDto,
  ) {
    const sourceBuffer = await resolveSourceImage(file, dto.sourceImageUrl);
    const backgroundColor = parseBackgroundColor(dto.backgroundColor);
    const coverFitMode = dto.coverFitMode !== 'false';

    try {
      // Preview never creates/moves/deletes anything, so it only needs a
      // cached read of the live channel list (to resolve parentCid's
      // depth), not a dedicated connection of its own.
      const channels = await fetchLiveChannels();
      const { relativeRows, parentDepth } = await prepareRows(
        channels,
        dto.parentCid,
        dto.spacerMode,
      );
      const absoluteRows = relativeRows.map((r) => ({
        ...r,
        depth: parentDepth + 1 + r.depth,
      }));

      const slices = await sliceWallpaper(sourceBuffer, absoluteRows, {
        xOffset: dto.xOffset,
        yOffset: dto.yOffset,
        backgroundColor,
        coverFitMode,
      });
      const relativeRowsUsed = relativeRows.slice(0, slices.length);

      return {
        rows: slices.map((slice, i) => ({
          depth: relativeRowsUsed[i].depth,
          isSpacer: relativeRowsUsed[i].isSpacer,
          imageDataUrl: `data:${OUTPUT_MIME_TYPE};base64,${slice.image.toString('base64')}`,
        })),
      };
    } catch (err) {
      if (err instanceof InvalidImageError) {
        throw new UnsupportedMediaTypeException(err.message);
      }
      if (err instanceof ImageTooLargeError) {
        throw new UnprocessableEntityException(err.message);
      }
      if (err instanceof BadRequestException) {
        throw err;
      }
      logger.error('[preview] Unexpected error:', err);
      this.metrics.teamspeakErrorsTotal.inc({ operation: 'list-channels' });
      throw new ServiceUnavailableException(
        'TeamSpeak is currently unreachable',
      );
    }
  }

  @Post('undo')
  @Roles(OIDC_ADMIN_ROLE)
  @AuditAction('undo-channel-wallpaper')
  @UseInterceptors(AuditLoggingInterceptor)
  @ApiOperation({
    summary: 'Deletes previously-generated channels by cid (admin only)',
  })
  async undo(@Body() dto: UndoChannelWallpaperDto) {
    try {
      return await deleteManagedChannels(dto.cids);
    } catch (err) {
      logger.error('[undo] Unexpected error:', err);
      this.metrics.teamspeakErrorsTotal.inc({
        operation: 'undo-channel-wallpaper',
      });
      throw new ServiceUnavailableException(
        'TeamSpeak is currently unreachable',
      );
    }
  }
}
