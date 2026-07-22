import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ImagesLocalController,
  imageFileFilter,
  resolveUploadChannel,
  ChannelNotFoundError,
  ChannelNameConflictError,
} from './images.controller.local';
import {
  fetchImageSafely,
  SsrfValidationError,
  FetchFailedError,
} from './safe-url-fetcher';
import {
  fetchLiveChannels,
  setChannelBannerUrl,
  applyBannerUrlsForAllChannels,
} from '../teamspeak/teamspeak-channels';
import { processImageForStorage } from './image-processing';
import type { ImagesService } from './images.service';
import type { MetricsService } from '../metrics/metrics.service';

const TEST_PUBLIC_BASE_URL = 'https://ts-icon.example.test';

// getPublicBaseUrl() is read once, at construction time, by
// ImagesLocalController's publicBaseUrl field -- config.ts captures
// process.env.PUBLIC_BASE_URL into a module-level const at import time, so
// setting process.env directly in this file would be too late (imports are
// evaluated before any other top-level statement here). Mocking the
// function itself sidesteps that entirely.
jest.mock('../../config', () => {
  const actual =
    jest.requireActual<typeof import('../../config')>('../../config');
  return {
    ...actual,
    getPublicBaseUrl: jest.fn(() => TEST_PUBLIC_BASE_URL),
  };
});

jest.mock('./safe-url-fetcher', () => {
  const actual =
    jest.requireActual<typeof import('./safe-url-fetcher')>(
      './safe-url-fetcher',
    );
  return {
    ...actual,
    fetchImageSafely: jest.fn(),
  };
});

jest.mock('../teamspeak/teamspeak-channels', () => {
  // expectedBannerUrl/isManagedByUs are pure functions with no I/O -- kept
  // as their real implementations rather than mocked, same reasoning as
  // normalizeChannelName elsewhere in this codebase not being mocked.
  const actual = jest.requireActual<
    typeof import('../teamspeak/teamspeak-channels')
  >('../teamspeak/teamspeak-channels');
  return {
    ...actual,
    fetchLiveChannels: jest.fn(),
    setChannelBannerUrl: jest.fn(),
    applyBannerUrlsForAllChannels: jest.fn(),
  };
});

jest.mock('./image-processing', () => {
  const actual =
    jest.requireActual<typeof import('./image-processing')>(
      './image-processing',
    );
  return {
    ...actual,
    processImageForStorage: jest.fn(),
  };
});

const mockedFetch = fetchImageSafely as jest.MockedFunction<
  typeof fetchImageSafely
>;
const mockedFetchLiveChannels = fetchLiveChannels as jest.MockedFunction<
  typeof fetchLiveChannels
>;
const mockedProcessImage = processImageForStorage as jest.MockedFunction<
  typeof processImageForStorage
>;
const mockedSetChannelBannerUrl = setChannelBannerUrl as jest.MockedFunction<
  typeof setChannelBannerUrl
>;
const mockedApplyBannerUrlsForAllChannels =
  applyBannerUrlsForAllChannels as jest.MockedFunction<
    typeof applyBannerUrlsForAllChannels
  >;

// Returns both the stub itself and direct references to its jest.fn()s.
// Handing back the mock function references directly (rather than reading
// e.g. `imagesService.channelNameInUse` back off the object later) sidesteps
// @typescript-eslint/unbound-method, same as `createRes()` below already does
// for `Response`.
function createImagesServiceStub(): {
  imagesService: ImagesService;
  findByChannelId: jest.Mock;
  channelNameInUse: jest.Mock;
  saveImage: jest.Mock;
} {
  const findByChannelId = jest.fn().mockResolvedValue(null);
  const channelNameInUse = jest.fn().mockResolvedValue(false);
  const saveImage = jest.fn();
  const imagesService = {
    saveImage,
    getImage: jest.fn(),
    listOptions: jest.fn(),
    findByChannelId,
    channelNameInUse,
  } as unknown as ImagesService;
  return { imagesService, findByChannelId, channelNameInUse, saveImage };
}

// Only the counters actually exercised by these tests get real jest.fn()s;
// everything else on MetricsService is simply absent from the stub, which is
// fine since no test here touches those other counters.
function createMetricsStub(): {
  metrics: MetricsService;
  imageUploadsIncMock: jest.Mock;
  teamspeakErrorsIncMock: jest.Mock;
  ssrfBlockedIncMock: jest.Mock;
} {
  const imageUploadsIncMock = jest.fn();
  const teamspeakErrorsIncMock = jest.fn();
  const ssrfBlockedIncMock = jest.fn();
  const metrics = {
    imageUploadsTotal: { inc: imageUploadsIncMock },
    teamspeakErrorsTotal: { inc: teamspeakErrorsIncMock },
    ssrfBlockedTotal: { inc: ssrfBlockedIncMock },
  } as unknown as MetricsService;
  return {
    metrics,
    imageUploadsIncMock,
    teamspeakErrorsIncMock,
    ssrfBlockedIncMock,
  };
}

function createController(
  imagesService: ImagesService = createImagesServiceStub().imagesService,
  metrics: MetricsService = createMetricsStub().metrics,
): ImagesLocalController {
  return new ImagesLocalController(imagesService, metrics);
}

function createRes(): { res: Response; setHeader: jest.Mock; send: jest.Mock } {
  const setHeader = jest.fn();
  const send = jest.fn();
  // Handing back the jest.fn() references directly (rather than reading
  // `res.setHeader`/`res.send` back off the object later) sidesteps
  // @typescript-eslint/unbound-method, which flags any bare reference to a
  // method the `Response` type declares, mock or not.
  return { res: { setHeader, send } as unknown as Response, setHeader, send };
}

// A minimal stand-in for the `Request` object `@Req()` injects in the real
// app. `sub` defaults to a fixed test subject since most tests here care
// about something other than who's making the request; pass `undefined`
// explicitly for the "no authenticated subject" case.
function createReq(sub: string | undefined = 'test-subject'): Request {
  return { user: sub ? { sub, roles: [] } : undefined } as unknown as Request;
}

beforeEach(() => {
  // Most tests in this file exercise something *other* than channel
  // resolution (SSRF handling, image-processing errors, etc.), so channel
  // resolution defaults to "a live channel called 'chan' exists and it's
  // brand new" unless a specific test overrides it.
  mockedFetchLiveChannels.mockResolvedValue([
    { cid: 'cid-chan', name: 'Chan', bannerGfxUrl: null },
  ]);
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('imageFileFilter', () => {
  function createFile(mimetype?: string) {
    return (mimetype === undefined ? {} : { mimetype }) as Express.Multer.File;
  }

  it('accepts an allowed mime type', () => {
    const cb = jest.fn();
    imageFileFilter({}, createFile('image/png'), cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it('rejects a disallowed mime type with a 415, not a generic error', () => {
    const cb = jest.fn();
    imageFileFilter({}, createFile('application/pdf'), cb);
    expect(cb).toHaveBeenCalledTimes(1);
    const [err, acceptFile] = cb.mock.calls[0] as [Error, boolean];
    expect(err).toBeInstanceOf(UnsupportedMediaTypeException);
    expect((err as UnsupportedMediaTypeException).getStatus()).toBe(415);
    expect(acceptFile).toBe(false);
  });

  it('rejects a missing mimetype with a 400, not a generic error', () => {
    const cb = jest.fn();
    imageFileFilter({}, createFile(undefined), cb);
    const [err] = cb.mock.calls[0] as [Error, boolean];
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).getStatus()).toBe(400);
  });
});

describe('resolveUploadChannel', () => {
  it('rejects with ChannelNotFoundError when no live channel matches the given name', async () => {
    mockedFetchLiveChannels.mockResolvedValue([
      { cid: 'cid-1', name: 'Something Else', bannerGfxUrl: null },
    ]);
    const { imagesService } = createImagesServiceStub();

    await expect(
      resolveUploadChannel(imagesService, 'chan'),
    ).rejects.toBeInstanceOf(ChannelNotFoundError);
  });

  it('resolves as an update when an existing row already has this exact channelId', async () => {
    mockedFetchLiveChannels.mockResolvedValue([
      { cid: 'cid-chan', name: 'Chan', bannerGfxUrl: null },
    ]);
    const { imagesService, findByChannelId, channelNameInUse } =
      createImagesServiceStub();
    findByChannelId.mockResolvedValue({ channelName: 'chan' });

    const result = await resolveUploadChannel(imagesService, 'chan');

    expect(result).toEqual({ channelId: 'cid-chan', channelName: 'chan' });
    // The collision check must not even run once the channelId itself is
    // already known -- a rename to an unrelated name would otherwise risk a
    // false-positive conflict against the channel's own previous name.
    expect(channelNameInUse).not.toHaveBeenCalled();
  });

  it('resolves as a plain new-channel create when the channelId is new and the name is not taken', async () => {
    mockedFetchLiveChannels.mockResolvedValue([
      { cid: 'cid-chan', name: 'Chan', bannerGfxUrl: null },
    ]);
    const { imagesService, findByChannelId, channelNameInUse } =
      createImagesServiceStub();
    findByChannelId.mockResolvedValue(null);
    channelNameInUse.mockResolvedValue(false);

    const result = await resolveUploadChannel(imagesService, 'chan');

    expect(result).toEqual({ channelId: 'cid-chan', channelName: 'chan' });
  });

  it('rejects with ChannelNameConflictError when the channelId is new but a different row already owns this channelName', async () => {
    mockedFetchLiveChannels.mockResolvedValue([
      { cid: 'cid-chan', name: 'Chan', bannerGfxUrl: null },
    ]);
    const { imagesService, findByChannelId, channelNameInUse } =
      createImagesServiceStub();
    findByChannelId.mockResolvedValue(null);
    channelNameInUse.mockResolvedValue(true);

    await expect(
      resolveUploadChannel(imagesService, 'chan'),
    ).rejects.toBeInstanceOf(ChannelNameConflictError);
  });
});

describe('ImagesLocalController.uploadImageFromUrl', () => {
  it('maps SsrfValidationError to 400', async () => {
    mockedFetch.mockRejectedValue(new SsrfValidationError('not allowed'));
    const controller = createController();
    await expect(
      controller.uploadImageFromUrl(
        {
          channelName: 'chan',
          url: 'https://example.com/a.png',
        },
        createReq(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps FetchFailedError to 502, not 400', async () => {
    mockedFetch.mockRejectedValue(new FetchFailedError('could not fetch'));
    const controller = createController();
    const call = controller.uploadImageFromUrl(
      {
        channelName: 'chan',
        url: 'https://example.com/a.png',
      },
      createReq(),
    );
    await expect(call).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('rethrows unexpected errors rather than mislabeling them as 400', async () => {
    mockedFetch.mockRejectedValue(new Error('boom'));
    const controller = createController();
    const call = controller.uploadImageFromUrl(
      {
        channelName: 'chan',
        url: 'https://example.com/a.png',
      },
      createReq(),
    );
    await expect(call).rejects.toThrow('boom');
    await expect(call).rejects.not.toBeInstanceOf(BadRequestException);
  });

  it('rejects a channelName that normalizes to an empty string', async () => {
    const controller = createController();
    await expect(
      controller.uploadImageFromUrl(
        {
          channelName: '!!!',
          url: 'https://example.com/a.png',
        },
        createReq(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('rejects with 400 when no live channel matches the given name', async () => {
    mockedFetchLiveChannels.mockResolvedValue([]);
    const controller = createController();
    await expect(
      controller.uploadImageFromUrl(
        {
          channelName: 'chan',
          url: 'https://example.com/a.png',
        },
        createReq(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('rejects with 409 on a channelName collision with a different channel', async () => {
    const { imagesService, findByChannelId, channelNameInUse } =
      createImagesServiceStub();
    findByChannelId.mockResolvedValue(null);
    channelNameInUse.mockResolvedValue(true);
    const controller = createController(imagesService);

    await expect(
      controller.uploadImageFromUrl(
        {
          channelName: 'chan',
          url: 'https://example.com/a.png',
        },
        createReq(),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('passes the authenticated subject through to saveImage as the last-editor-subject', async () => {
    mockedProcessImage.mockResolvedValue({
      buffer: Buffer.from('processed'),
      mimeType: 'image/png',
    });
    mockedFetch.mockResolvedValue({
      buffer: Buffer.from('fetched'),
      contentType: 'image/png',
    });
    const { imagesService, saveImage } = createImagesServiceStub();
    const controller = createController(imagesService);

    await controller.uploadImageFromUrl(
      { channelName: 'chan', url: 'https://example.com/a.png' },
      createReq('editor-sub-1'),
    );

    expect(saveImage).toHaveBeenCalledWith(
      'chan',
      Buffer.from('processed'),
      'image/png',
      'cid-chan',
      'editor-sub-1',
    );
  });
});

describe('ImagesLocalController.proxyImage', () => {
  it('maps SsrfValidationError to 400', async () => {
    mockedFetch.mockRejectedValue(new SsrfValidationError('not allowed'));
    const controller = createController();
    const { res } = createRes();
    await expect(
      controller.proxyImage({ url: 'https://example.com/a.png' }, res),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps FetchFailedError to 502, not 400', async () => {
    mockedFetch.mockRejectedValue(new FetchFailedError('could not fetch'));
    const controller = createController();
    const { res } = createRes();
    await expect(
      controller.proxyImage({ url: 'https://example.com/a.png' }, res),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('streams the image through on success', async () => {
    mockedFetch.mockResolvedValue({
      buffer: Buffer.from('img'),
      contentType: 'image/png',
    });
    const controller = createController();
    const { res, setHeader, send } = createRes();
    await controller.proxyImage({ url: 'https://example.com/a.png' }, res);
    expect(setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
    expect(send).toHaveBeenCalledWith(Buffer.from('img'));
  });
});

describe('ImagesLocalController.listChannels', () => {
  it('returns 503 when TeamSpeak is unreachable, instead of a 200 with an error field', async () => {
    mockedFetchLiveChannels.mockRejectedValue(new Error('ECONNREFUSED'));
    const controller = createController();
    await expect(controller.listChannels()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('returns the normalized channel list on success', async () => {
    mockedFetchLiveChannels.mockResolvedValue([
      { cid: '1', name: 'Foo Bar', bannerGfxUrl: null },
    ]);
    const controller = createController();
    await expect(controller.listChannels()).resolves.toEqual({
      channels: ['foo-bar'],
    });
  });
});

describe('ImagesLocalController.uploadImage', () => {
  function createFile(): Express.Multer.File {
    return {
      buffer: Buffer.from('img-bytes'),
      mimetype: 'image/png',
    } as Express.Multer.File;
  }

  it('rejects with 400 when no live channel matches the given name', async () => {
    mockedFetchLiveChannels.mockResolvedValue([]);
    const controller = createController();
    await expect(
      controller.uploadImage('chan', createFile(), createReq()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects with 409 on a channelName collision with a different channel', async () => {
    const { imagesService, findByChannelId, channelNameInUse } =
      createImagesServiceStub();
    findByChannelId.mockResolvedValue(null);
    channelNameInUse.mockResolvedValue(true);
    const controller = createController(imagesService);

    await expect(
      controller.uploadImage('chan', createFile(), createReq()),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('increments the upload-success counter on a successful upload', async () => {
    mockedProcessImage.mockResolvedValue({
      buffer: Buffer.from('processed'),
      mimeType: 'image/png',
    });
    const { imagesService } = createImagesServiceStub();
    const { metrics, imageUploadsIncMock } = createMetricsStub();
    const controller = createController(imagesService, metrics);

    await controller.uploadImage('chan', createFile(), createReq());

    expect(imageUploadsIncMock).toHaveBeenCalledWith({
      method: 'upload',
      result: 'success',
    });
    expect(imageUploadsIncMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ result: 'failure' }),
    );
  });

  it('increments the upload-failure counter, and the TeamSpeak-error counter, when TeamSpeak is unreachable', async () => {
    mockedFetchLiveChannels.mockRejectedValue(new Error('ECONNREFUSED'));
    const { metrics, imageUploadsIncMock, teamspeakErrorsIncMock } =
      createMetricsStub();
    const controller = createController(undefined, metrics);

    await expect(
      controller.uploadImage('chan', createFile(), createReq()),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(imageUploadsIncMock).toHaveBeenCalledWith({
      method: 'upload',
      result: 'failure',
    });
    expect(teamspeakErrorsIncMock).toHaveBeenCalledWith({
      operation: 'resolve-channel',
    });
  });

  it('passes the authenticated subject through to saveImage as the last-editor-subject', async () => {
    mockedProcessImage.mockResolvedValue({
      buffer: Buffer.from('processed'),
      mimeType: 'image/png',
    });
    const { imagesService, saveImage } = createImagesServiceStub();
    const controller = createController(imagesService);

    await controller.uploadImage(
      'chan',
      createFile(),
      createReq('editor-sub-2'),
    );

    expect(saveImage).toHaveBeenCalledWith(
      'chan',
      Buffer.from('processed'),
      'image/png',
      'cid-chan',
      'editor-sub-2',
    );
  });
});

describe('ImagesLocalController.uploadImageFromUrl metrics', () => {
  it('increments the SSRF-blocked counter, labeled by route, when the URL is rejected', async () => {
    mockedFetch.mockRejectedValue(new SsrfValidationError('not allowed'));
    const { metrics, ssrfBlockedIncMock } = createMetricsStub();
    const controller = createController(undefined, metrics);

    await expect(
      controller.uploadImageFromUrl(
        {
          channelName: 'chan',
          url: 'https://example.com/a.png',
        },
        createReq(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(ssrfBlockedIncMock).toHaveBeenCalledWith({ route: 'from-url' });
  });
});

describe('ImagesLocalController.proxyImage metrics', () => {
  it('increments the SSRF-blocked counter, labeled by route, when the URL is rejected', async () => {
    mockedFetch.mockRejectedValue(new SsrfValidationError('not allowed'));
    const { metrics, ssrfBlockedIncMock } = createMetricsStub();
    const controller = createController(undefined, metrics);
    const { res } = createRes();

    await expect(
      controller.proxyImage({ url: 'https://example.com/a.png' }, res),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(ssrfBlockedIncMock).toHaveBeenCalledWith({
      route: 'img-from-url',
    });
  });
});

describe('ImagesLocalController.listChannelBannerUrls', () => {
  it('returns each channel with its bannerGfxUrl and computed managed flag', async () => {
    mockedFetchLiveChannels.mockResolvedValue([
      {
        cid: 'cid-1',
        name: 'General',
        bannerGfxUrl: `${TEST_PUBLIC_BASE_URL}/images/general`,
      },
      { cid: 'cid-2', name: 'Music', bannerGfxUrl: null },
    ]);
    const controller = createController();

    await expect(controller.listChannelBannerUrls()).resolves.toEqual({
      channels: [
        {
          name: 'general',
          bannerGfxUrl: `${TEST_PUBLIC_BASE_URL}/images/general`,
          managed: true,
        },
        { name: 'music', bannerGfxUrl: null, managed: false },
      ],
    });
  });

  it('returns 503 when TeamSpeak is unreachable', async () => {
    mockedFetchLiveChannels.mockRejectedValue(new Error('ECONNREFUSED'));
    const controller = createController();

    await expect(controller.listChannelBannerUrls()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

describe('ImagesLocalController.setBannerUrl', () => {
  it('rejects with 400 when no live channel matches the given name', async () => {
    mockedFetchLiveChannels.mockResolvedValue([]);
    const controller = createController();

    await expect(controller.setBannerUrl('chan')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(mockedSetChannelBannerUrl).not.toHaveBeenCalled();
  });

  it('sets the banner URL to the expected value for the resolved channel', async () => {
    mockedFetchLiveChannels.mockResolvedValue([
      { cid: 'cid-chan', name: 'Chan', bannerGfxUrl: null },
    ]);
    mockedSetChannelBannerUrl.mockResolvedValue(undefined);
    const controller = createController();

    const result = await controller.setBannerUrl('chan');

    expect(mockedSetChannelBannerUrl).toHaveBeenCalledWith(
      'cid-chan',
      `${TEST_PUBLIC_BASE_URL}/images/chan`,
    );
    expect(result).toEqual({
      message: 'Banner URL set successfully',
      bannerGfxUrl: `${TEST_PUBLIC_BASE_URL}/images/chan`,
    });
  });

  it('returns 503 when TeamSpeak is unreachable during channel resolution', async () => {
    mockedFetchLiveChannels.mockRejectedValue(new Error('ECONNREFUSED'));
    const controller = createController();

    await expect(controller.setBannerUrl('chan')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('returns 503 when setChannelBannerUrl itself fails', async () => {
    mockedFetchLiveChannels.mockResolvedValue([
      { cid: 'cid-chan', name: 'Chan', bannerGfxUrl: null },
    ]);
    mockedSetChannelBannerUrl.mockRejectedValue(new Error('rejected'));
    const controller = createController();

    await expect(controller.setBannerUrl('chan')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

describe('ImagesLocalController.applyBannerUrls', () => {
  it('returns the updated/alreadyManaged summary on success', async () => {
    mockedApplyBannerUrlsForAllChannels.mockResolvedValue({
      updated: ['music'],
      alreadyManaged: ['general'],
    });
    const controller = createController();

    await expect(controller.applyBannerUrls()).resolves.toEqual({
      updated: ['music'],
      alreadyManaged: ['general'],
    });
    expect(mockedApplyBannerUrlsForAllChannels).toHaveBeenCalledWith(
      TEST_PUBLIC_BASE_URL,
    );
  });

  it('returns 503 when TeamSpeak is unreachable', async () => {
    mockedApplyBannerUrlsForAllChannels.mockRejectedValue(
      new Error('ECONNREFUSED'),
    );
    const controller = createController();

    await expect(controller.applyBannerUrls()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
