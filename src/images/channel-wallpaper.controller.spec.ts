import 'reflect-metadata';
import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ChannelWallpaperController,
  parseBackgroundColor,
  namesForRows,
  prepareRows,
  resolveSourceImage,
} from './channel-wallpaper.controller';
import {
  withTeamSpeakConnection,
  listChannelsOnConnection,
  fetchLiveChannels,
  invalidateLiveChannelsCache,
} from '../teamspeak/teamspeak-channels';
import {
  createChannelWallpaper,
  deleteManagedChannels,
} from '../teamspeak/teamspeak-channel-admin';
import { sliceWallpaper } from './wallpaper-slicer';
import { fetchImageSafely, FetchFailedError } from './safe-url-fetcher';
import { InvalidImageError } from './image-processing';
import type { ImagesService } from './images.service';
import type { MetricsService } from '../metrics/metrics.service';
import { ROLES_KEY } from '../auth/roles.decorator';
import { OIDC_ADMIN_ROLE } from '../../config';
import type { GenerateChannelWallpaperDto } from './dto/generate-channel-wallpaper.dto';

const TEST_PUBLIC_BASE_URL = 'https://ts-icon.example.test';

jest.mock('../../config', () => {
  const actual =
    jest.requireActual<typeof import('../../config')>('../../config');
  return { ...actual, getPublicBaseUrl: jest.fn(() => TEST_PUBLIC_BASE_URL) };
});

jest.mock('./safe-url-fetcher', () => {
  const actual =
    jest.requireActual<typeof import('./safe-url-fetcher')>(
      './safe-url-fetcher',
    );
  return { ...actual, fetchImageSafely: jest.fn() };
});

jest.mock('../teamspeak/teamspeak-channels', () => {
  const actual = jest.requireActual<
    typeof import('../teamspeak/teamspeak-channels')
  >('../teamspeak/teamspeak-channels');
  return {
    ...actual,
    withTeamSpeakConnection: jest.fn(),
    listChannelsOnConnection: jest.fn(),
    fetchLiveChannels: jest.fn(),
    invalidateLiveChannelsCache: jest.fn(),
  };
});

jest.mock('../teamspeak/teamspeak-channel-admin', () => ({
  createChannelWallpaper: jest.fn(),
  deleteManagedChannels: jest.fn(),
}));

jest.mock('./wallpaper-slicer', () => {
  const actual =
    jest.requireActual<typeof import('./wallpaper-slicer')>(
      './wallpaper-slicer',
    );
  return { ...actual, sliceWallpaper: jest.fn() };
});

const mockedWithTeamSpeakConnection =
  withTeamSpeakConnection as jest.MockedFunction<
    typeof withTeamSpeakConnection
  >;
const mockedListChannelsOnConnection =
  listChannelsOnConnection as jest.MockedFunction<
    typeof listChannelsOnConnection
  >;
const mockedFetchLiveChannels = fetchLiveChannels as jest.MockedFunction<
  typeof fetchLiveChannels
>;
const mockedInvalidateCache =
  invalidateLiveChannelsCache as jest.MockedFunction<
    typeof invalidateLiveChannelsCache
  >;
const mockedCreateChannelWallpaper =
  createChannelWallpaper as jest.MockedFunction<typeof createChannelWallpaper>;
const mockedDeleteManagedChannels =
  deleteManagedChannels as jest.MockedFunction<typeof deleteManagedChannels>;
const mockedSliceWallpaper = sliceWallpaper as jest.MockedFunction<
  typeof sliceWallpaper
>;
const mockedFetchImageSafely = fetchImageSafely as jest.MockedFunction<
  typeof fetchImageSafely
>;

function createImagesServiceStub(): {
  imagesService: ImagesService;
  channelNameInUse: jest.Mock;
  saveImage: jest.Mock;
} {
  const channelNameInUse = jest.fn().mockResolvedValue(false);
  const saveImage = jest.fn().mockResolvedValue(undefined);
  const imagesService = {
    channelNameInUse,
    saveImage,
  } as unknown as ImagesService;
  return { imagesService, channelNameInUse, saveImage };
}

function createMetricsStub(): {
  metrics: MetricsService;
  wallpaperIncMock: jest.Mock;
  teamspeakErrorsIncMock: jest.Mock;
} {
  const wallpaperIncMock = jest.fn();
  const teamspeakErrorsIncMock = jest.fn();
  const metrics = {
    channelWallpaperGenerationsTotal: { inc: wallpaperIncMock },
    teamspeakErrorsTotal: { inc: teamspeakErrorsIncMock },
  } as unknown as MetricsService;
  return { metrics, wallpaperIncMock, teamspeakErrorsIncMock };
}

function createController(
  imagesService: ImagesService = createImagesServiceStub().imagesService,
  metrics: MetricsService = createMetricsStub().metrics,
): ChannelWallpaperController {
  return new ChannelWallpaperController(imagesService, metrics);
}

function createReq(sub = 'test-subject'): Request {
  return { user: { sub, roles: [] } } as unknown as Request;
}

function fakeFile(): Express.Multer.File {
  return { buffer: Buffer.from('fake-image-bytes') } as Express.Multer.File;
}

const FLAT_CHANNELS = [
  { cid: '1', name: 'General', bannerGfxUrl: null, pid: null },
];

beforeEach(() => {
  mockedListChannelsOnConnection.mockResolvedValue(FLAT_CHANNELS);
  mockedFetchLiveChannels.mockResolvedValue(FLAT_CHANNELS);
  mockedWithTeamSpeakConnection.mockImplementation(async (fn) =>
    fn({} as never),
  );
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('parseBackgroundColor', () => {
  it('returns undefined when no hex is given', () => {
    expect(parseBackgroundColor(undefined)).toBeUndefined();
  });

  it('parses a #RRGGBB hex string, defaulting alpha to 255', () => {
    expect(parseBackgroundColor('#112233')).toEqual({
      r: 0x11,
      g: 0x22,
      b: 0x33,
      alpha: 255,
    });
  });

  it('parses a #RRGGBBAA hex string including alpha', () => {
    expect(parseBackgroundColor('#11223344')).toEqual({
      r: 0x11,
      g: 0x22,
      b: 0x33,
      alpha: 0x44,
    });
  });

  it('throws BadRequestException for a malformed hex string', () => {
    expect(() => parseBackgroundColor('not-a-color')).toThrow(
      BadRequestException,
    );
  });
});

describe('namesForRows', () => {
  it('numbers art and spacer rows independently', () => {
    const rows = [
      { depth: 0, isSpacer: false },
      { depth: 1, isSpacer: true },
      { depth: 0, isSpacer: false },
      { depth: 1, isSpacer: true },
    ];
    expect(namesForRows('Wall', rows)).toEqual([
      'Wall 1',
      'Wall spacer 1',
      'Wall 2',
      'Wall spacer 2',
    ]);
  });
});

describe('prepareRows', () => {
  const channels = [
    { cid: '1', name: 'Root', bannerGfxUrl: null, pid: null },
    { cid: '2', name: 'Child', bannerGfxUrl: null, pid: '1' },
  ];

  it('resolves parentDepth -1 for no parentCid (top-level)', async () => {
    const { parentDepth } = await prepareRows(channels, undefined, 'flat');
    expect(parentDepth).toBe(-1);
  });

  it('resolves parentDepth for an existing nested parentCid', async () => {
    const { parentDepth } = await prepareRows(channels, '2', 'flat');
    expect(parentDepth).toBe(1);
  });

  it('throws BadRequestException when parentCid matches no live channel', async () => {
    await expect(
      prepareRows(channels, 'missing', 'flat'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('resolveSourceImage', () => {
  it('throws when both file and sourceImageUrl are given', async () => {
    await expect(
      resolveSourceImage(fakeFile(), 'https://example.test/x.png'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when neither file nor sourceImageUrl are given', async () => {
    await expect(
      resolveSourceImage(undefined, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns the file buffer when a file is given', async () => {
    const file = fakeFile();
    await expect(resolveSourceImage(file, undefined)).resolves.toBe(
      file.buffer,
    );
  });

  it('fetches the URL via fetchImageSafely when sourceImageUrl is given', async () => {
    const buffer = Buffer.from('fetched-bytes');
    mockedFetchImageSafely.mockResolvedValue({
      buffer,
      contentType: 'image/png',
    });
    await expect(
      resolveSourceImage(undefined, 'https://example.test/x.png'),
    ).resolves.toBe(buffer);
  });

  it('maps a FetchFailedError from fetchImageSafely to 422, not a generic 500', async () => {
    mockedFetchImageSafely.mockRejectedValue(
      new FetchFailedError('too many redirects'),
    );
    await expect(
      resolveSourceImage(undefined, 'https://example.test/x.png'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});

function baseDto(
  overrides: Partial<GenerateChannelWallpaperDto> = {},
): GenerateChannelWallpaperDto {
  return {
    namePrefix: 'Wall',
    spacerMode: 'flat',
    ...overrides,
  } as GenerateChannelWallpaperDto;
}

describe('ChannelWallpaperController.generate', () => {
  it('pre-checks name collisions for the whole prospective range before creating anything', async () => {
    // relativeRows (the real, unmocked buildAlternatingRowPlan output) always
    // alternates art/spacer regardless of spacerMode -- 2 rows means "Wall 1"
    // (art) then "Wall spacer 1" (spacer), which is what the row names are
    // actually derived from, not sliceWallpaper's mocked return value here.
    mockedSliceWallpaper.mockResolvedValue([
      { row: { depth: 0, isSpacer: false }, image: Buffer.from('a') },
      { row: { depth: 0, isSpacer: false }, image: Buffer.from('b') },
    ]);
    const { imagesService, channelNameInUse, saveImage } =
      createImagesServiceStub();
    channelNameInUse.mockImplementation((name: string) =>
      Promise.resolve(name === 'Wall spacer 1'),
    );
    const controller = createController(imagesService);

    await expect(
      controller.generate(fakeFile(), baseDto(), createReq()),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(channelNameInUse).toHaveBeenCalledWith('Wall 1');
    expect(channelNameInUse).toHaveBeenCalledWith('Wall spacer 1');
    expect(mockedCreateChannelWallpaper).not.toHaveBeenCalled();
    expect(saveImage).not.toHaveBeenCalled();
  });

  it('creates channels in order and saves each successfully-created row image', async () => {
    mockedSliceWallpaper.mockResolvedValue([
      { row: { depth: 0, isSpacer: false }, image: Buffer.from('row1') },
      { row: { depth: 0, isSpacer: true }, image: Buffer.from('row2') },
    ]);
    mockedCreateChannelWallpaper.mockResolvedValue({
      created: [
        { cid: '10', name: 'Wall 1', depth: 0, isSpacer: false },
        { cid: '11', name: 'Wall spacer 1', depth: 0, isSpacer: true },
      ],
    });
    const { imagesService, saveImage } = createImagesServiceStub();
    const { metrics, wallpaperIncMock } = createMetricsStub();
    const controller = createController(imagesService, metrics);

    const result = await controller.generate(
      fakeFile(),
      baseDto(),
      createReq('subj-1'),
    );

    expect(result.createdChannels).toEqual([
      { cid: '10', name: 'Wall 1', kind: 'art', depth: 0 },
      { cid: '11', name: 'Wall spacer 1', kind: 'spacer', depth: 0 },
    ]);
    expect(result.rowCount).toBe(2);
    expect(saveImage).toHaveBeenNthCalledWith(
      1,
      'Wall 1',
      Buffer.from('row1'),
      'image/png',
      '10',
      'subj-1',
    );
    expect(saveImage).toHaveBeenNthCalledWith(
      2,
      'Wall spacer 1',
      Buffer.from('row2'),
      'image/png',
      '11',
      'subj-1',
    );
    expect(mockedInvalidateCache).toHaveBeenCalledTimes(1);
    expect(wallpaperIncMock).toHaveBeenCalledWith({ result: 'success' });
  });

  it('reports a mid-batch failure without throwing, and only saves images for rows that actually succeeded', async () => {
    mockedSliceWallpaper.mockResolvedValue([
      { row: { depth: 0, isSpacer: false }, image: Buffer.from('row1') },
      { row: { depth: 0, isSpacer: false }, image: Buffer.from('row2') },
    ]);
    mockedCreateChannelWallpaper.mockResolvedValue({
      created: [{ cid: '10', name: 'Wall 1', depth: 0, isSpacer: false }],
      failedAt: { name: 'Wall 2', error: 'name already exists' },
    });
    const { imagesService, saveImage } = createImagesServiceStub();
    const { metrics, wallpaperIncMock } = createMetricsStub();
    const controller = createController(imagesService, metrics);

    const result = await controller.generate(
      fakeFile(),
      baseDto(),
      createReq(),
    );

    expect(result.createdChannels).toHaveLength(1);
    expect(result.failedAt).toEqual({
      name: 'Wall 2',
      error: 'name already exists',
    });
    expect(saveImage).toHaveBeenCalledTimes(1);
    expect(wallpaperIncMock).toHaveBeenCalledWith({
      result: 'partial-failure',
    });
  });

  it('maps an InvalidImageError from slicing to 415, not a generic 503', async () => {
    mockedSliceWallpaper.mockRejectedValue(
      new InvalidImageError('not a real image'),
    );
    const controller = createController();

    await expect(
      controller.generate(fakeFile(), baseDto(), createReq()),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
    expect(mockedCreateChannelWallpaper).not.toHaveBeenCalled();
  });

  it('maps an unexpected connection failure to 503 and increments the TeamSpeak-error counter', async () => {
    mockedWithTeamSpeakConnection.mockRejectedValue(new Error('ECONNREFUSED'));
    const { metrics, teamspeakErrorsIncMock } = createMetricsStub();
    const controller = createController(undefined, metrics);

    await expect(
      controller.generate(fakeFile(), baseDto(), createReq()),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(teamspeakErrorsIncMock).toHaveBeenCalledWith({
      operation: 'generate-channel-wallpaper',
    });
  });
});

describe('ChannelWallpaperController.preview', () => {
  it('never touches ServerQuery mutation or image storage', async () => {
    mockedSliceWallpaper.mockResolvedValue([
      { row: { depth: 0, isSpacer: false }, image: Buffer.from('row1') },
    ]);
    const { imagesService, saveImage } = createImagesServiceStub();
    const controller = createController(imagesService);

    const result = await controller.preview(fakeFile(), baseDto());

    expect(result.rows).toEqual([
      {
        depth: 0,
        isSpacer: false,
        imageDataUrl: `data:image/png;base64,${Buffer.from('row1').toString('base64')}`,
      },
    ]);
    expect(mockedWithTeamSpeakConnection).not.toHaveBeenCalled();
    expect(mockedCreateChannelWallpaper).not.toHaveBeenCalled();
    expect(saveImage).not.toHaveBeenCalled();
    expect(mockedInvalidateCache).not.toHaveBeenCalled();
  });

  it('uses the cached fetchLiveChannels() rather than opening a dedicated connection', async () => {
    mockedSliceWallpaper.mockResolvedValue([]);
    const controller = createController();

    await controller.preview(fakeFile(), baseDto());

    expect(mockedFetchLiveChannels).toHaveBeenCalledTimes(1);
    expect(mockedListChannelsOnConnection).not.toHaveBeenCalled();
  });
});

describe('ChannelWallpaperController.undo', () => {
  it('deletes the given cids', async () => {
    mockedDeleteManagedChannels.mockResolvedValue({
      deleted: ['1', '2'],
      failed: [],
    });
    const controller = createController();

    const result = await controller.undo({ cids: ['1', '2'] });

    expect(mockedDeleteManagedChannels).toHaveBeenCalledWith(['1', '2']);
    expect(result).toEqual({ deleted: ['1', '2'], failed: [] });
  });

  it('maps an unexpected failure to 503', async () => {
    mockedDeleteManagedChannels.mockRejectedValue(new Error('ECONNREFUSED'));
    const controller = createController();

    await expect(controller.undo({ cids: ['1'] })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

describe('ChannelWallpaperController role requirements', () => {
  function rolesOf(methodName: keyof ChannelWallpaperController): unknown {
    return Reflect.getMetadata(
      ROLES_KEY,
      ChannelWallpaperController.prototype[methodName],
    );
  }

  it('requires the admin role for generate/preview/undo', () => {
    expect(rolesOf('generate')).toEqual([OIDC_ADMIN_ROLE]);
    expect(rolesOf('preview')).toEqual([OIDC_ADMIN_ROLE]);
    expect(rolesOf('undo')).toEqual([OIDC_ADMIN_ROLE]);
  });
});
