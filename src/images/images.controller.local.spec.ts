import {
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ImagesLocalController,
  imageFileFilter,
} from './images.controller.local';
import {
  fetchImageSafely,
  SsrfValidationError,
  FetchFailedError,
} from './safe-url-fetcher';
import { TeamSpeak } from 'ts3-nodejs-library';
import type { ImagesService } from './images.service';

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

jest.mock('ts3-nodejs-library', () => ({
  TeamSpeak: { connect: jest.fn() },
}));

jest.mock('../../config', () => ({
  ...jest.requireActual<typeof import('../../config')>('../../config'),
  getTeamSpeakCredentials: jest.fn(() => ({
    username: 'user',
    password: 'pass',
  })),
}));

const mockedFetch = fetchImageSafely as jest.MockedFunction<
  typeof fetchImageSafely
>;
// `jest.spyOn` (rather than a direct `TeamSpeak.connect` property read) avoids
// @typescript-eslint/unbound-method, which flags any bare reference to a
// class's method as a value even when nothing here ever calls it with a
// `this` binding.
const mockedConnect = jest.spyOn(TeamSpeak, 'connect');

function createController(): ImagesLocalController {
  const imagesService = {
    saveImage: jest.fn(),
    getImage: jest.fn(),
    listOptions: jest.fn(),
  } as unknown as ImagesService;
  return new ImagesLocalController(imagesService);
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
    mockedConnect.mockRejectedValue(new Error('ECONNREFUSED'));
    const controller = createController();
    await expect(controller.listChannels()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('returns the normalized channel list on success', async () => {
    const fakeTeamSpeak = {
      on: jest.fn(),
      channelList: jest.fn().mockResolvedValue([{ name: 'Foo Bar' }]),
      quit: jest.fn().mockResolvedValue(undefined),
    };
    mockedConnect.mockResolvedValue(fakeTeamSpeak as unknown as TeamSpeak);
    const controller = createController();
    await expect(controller.listChannels()).resolves.toEqual({
      channels: ['foo-bar'],
    });
  });
});
