import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Response } from 'express';
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
import { fetchLiveChannels } from '../teamspeak/teamspeak-channels';
import { processImageForStorage } from './image-processing';
import type { ImagesService } from './images.service';
import type { MetricsService } from '../metrics/metrics.service';

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

jest.mock('../teamspeak/teamspeak-channels', () => ({
  fetchLiveChannels: jest.fn(),
}));

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

// Returns both the stub itself and direct references to its jest.fn()s.
// Handing back the mock function references directly (rather than reading
// e.g. `imagesService.channelNameInUse` back off the object later) sidesteps
// @typescript-eslint/unbound-method, same as `createRes()` below already does
// for `Response`.
function createImagesServiceStub(): {
  imagesService: ImagesService;
  findByChannelId: jest.Mock;
  channelNameInUse: jest.Mock;
} {
  const findByChannelId = jest.fn().mockResolvedValue(null);
  const channelNameInUse = jest.fn().mockResolvedValue(false);
  const imagesService = {
    saveImage: jest.fn(),
    getImage: jest.fn(),
    listOptions: jest.fn(),
    findByChannelId,
    channelNameInUse,
  } as unknown as ImagesService;
  return { imagesService, findByChannelId, channelNameInUse };
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

beforeEach(() => {
  // Most tests in this file exercise something *other* than channel
  // resolution (SSRF handling, image-processing errors, etc.), so channel
  // resolution defaults to "a live channel called 'chan' exists and it's
  // brand new" unless a specific test overrides it.
  mockedFetchLiveChannels.mockResolvedValue([
    { cid: 'cid-chan', name: 'Chan' },
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
      { cid: 'cid-1', name: 'Something Else' },
    ]);
    const { imagesService } = createImagesServiceStub();

    await expect(
      resolveUploadChannel(imagesService, 'chan'),
    ).rejects.toBeInstanceOf(ChannelNotFoundError);
  });

  it('resolves as an update when an existing row already has this exact channelId', async () => {
    mockedFetchLiveChannels.mockResolvedValue([
      { cid: 'cid-chan', name: 'Chan' },
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
      { cid: 'cid-chan', name: 'Chan' },
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
      { cid: 'cid-chan', name: 'Chan' },
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
      controller.uploadImageFromUrl({
        channelName: 'chan',
        url: 'https://example.com/a.png',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps FetchFailedError to 502, not 400', async () => {
    mockedFetch.mockRejectedValue(new FetchFailedError('could not fetch'));
    const controller = createController();
    const call = controller.uploadImageFromUrl({
      channelName: 'chan',
      url: 'https://example.com/a.png',
    });
    await expect(call).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('rethrows unexpected errors rather than mislabeling them as 400', async () => {
    mockedFetch.mockRejectedValue(new Error('boom'));
    const controller = createController();
    const call = controller.uploadImageFromUrl({
      channelName: 'chan',
      url: 'https://example.com/a.png',
    });
    await expect(call).rejects.toThrow('boom');
    await expect(call).rejects.not.toBeInstanceOf(BadRequestException);
  });

  it('rejects a channelName that normalizes to an empty string', async () => {
    const controller = createController();
    await expect(
      controller.uploadImageFromUrl({
        channelName: '!!!',
        url: 'https://example.com/a.png',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('rejects with 400 when no live channel matches the given name', async () => {
    mockedFetchLiveChannels.mockResolvedValue([]);
    const controller = createController();
    await expect(
      controller.uploadImageFromUrl({
        channelName: 'chan',
        url: 'https://example.com/a.png',
      }),
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
      controller.uploadImageFromUrl({
        channelName: 'chan',
        url: 'https://example.com/a.png',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(mockedFetch).not.toHaveBeenCalled();
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
    mockedFetchLiveChannels.mockResolvedValue([{ cid: '1', name: 'Foo Bar' }]);
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
      controller.uploadImage('chan', createFile()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects with 409 on a channelName collision with a different channel', async () => {
    const { imagesService, findByChannelId, channelNameInUse } =
      createImagesServiceStub();
    findByChannelId.mockResolvedValue(null);
    channelNameInUse.mockResolvedValue(true);
    const controller = createController(imagesService);

    await expect(
      controller.uploadImage('chan', createFile()),
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

    await controller.uploadImage('chan', createFile());

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
      controller.uploadImage('chan', createFile()),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(imageUploadsIncMock).toHaveBeenCalledWith({
      method: 'upload',
      result: 'failure',
    });
    expect(teamspeakErrorsIncMock).toHaveBeenCalledWith({
      operation: 'resolve-channel',
    });
  });
});

describe('ImagesLocalController.uploadImageFromUrl metrics', () => {
  it('increments the SSRF-blocked counter, labeled by route, when the URL is rejected', async () => {
    mockedFetch.mockRejectedValue(new SsrfValidationError('not allowed'));
    const { metrics, ssrfBlockedIncMock } = createMetricsStub();
    const controller = createController(undefined, metrics);

    await expect(
      controller.uploadImageFromUrl({
        channelName: 'chan',
        url: 'https://example.com/a.png',
      }),
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
