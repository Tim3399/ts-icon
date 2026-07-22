import { TeamSpeak } from 'ts3-nodejs-library';
import {
  createManagedChannel,
  deleteManagedChannels,
  createChannelWallpaper,
  type WallpaperChannelSlice,
} from './teamspeak-channel-admin';
import {
  fetchLiveChannels,
  invalidateLiveChannelsCache,
} from './teamspeak-channels';

jest.mock('ts3-nodejs-library', () => ({
  TeamSpeak: { connect: jest.fn() },
  QueryProtocol: { RAW: 'raw', SSH: 'ssh' },
}));

jest.mock('../../config', () => ({
  ...jest.requireActual<typeof import('../../config')>('../../config'),
  getTeamSpeakCredentials: jest.fn(() => ({
    username: 'user',
    password: 'pass',
  })),
}));

const mockedConnect = jest.spyOn(TeamSpeak, 'connect');

beforeEach(() => {
  invalidateLiveChannelsCache();
});

afterEach(() => {
  jest.clearAllMocks();
});

function fakeChannel(cid: string, name: string) {
  return { cid, name };
}

describe('createManagedChannel', () => {
  it('creates a permanent channel with the banner URL set at creation time', async () => {
    const channelCreate = jest
      .fn()
      .mockResolvedValue(fakeChannel('10', 'Art 1'));
    const fakeTeamSpeak = { on: jest.fn(), channelCreate, quit: jest.fn() };
    mockedConnect.mockResolvedValue(fakeTeamSpeak as never);

    const ts3 = await TeamSpeak.connect({} as never);
    const result = await createManagedChannel(ts3, {
      parentCid: '5',
      name: 'Art 1',
      orderAfterCid: '4',
      bannerUrl: 'https://example.test/images/art-1.png',
    });

    expect(channelCreate).toHaveBeenCalledWith('Art 1', {
      cpid: '5',
      channelOrder: 4,
      channelFlagPermanent: true,
      channelBannerGfxUrl: 'https://example.test/images/art-1.png',
    });
    expect(result).toEqual({ cid: '10', name: 'Art 1' });
  });

  it('uses cpid "0" for a null parentCid (top-level)', async () => {
    const channelCreate = jest.fn().mockResolvedValue(fakeChannel('1', 'Top'));
    const fakeTeamSpeak = { on: jest.fn(), channelCreate, quit: jest.fn() };
    mockedConnect.mockResolvedValue(fakeTeamSpeak as never);

    const ts3 = await TeamSpeak.connect({} as never);
    await createManagedChannel(ts3, {
      parentCid: null,
      name: 'Top',
      orderAfterCid: null,
      bannerUrl: 'https://example.test/images/top.png',
    });

    expect(channelCreate).toHaveBeenCalledWith(
      'Top',
      expect.objectContaining({ cpid: '0', channelOrder: undefined }),
    );
  });
});

describe('deleteManagedChannels', () => {
  it('deletes every given cid over a single connection and invalidates the cache', async () => {
    const channelDelete = jest.fn().mockResolvedValue([]);
    const quit = jest.fn().mockResolvedValue(undefined);
    mockedConnect.mockResolvedValue({
      on: jest.fn(),
      channelDelete,
      quit,
    } as never);

    const result = await deleteManagedChannels(['1', '2', '3']);

    expect(mockedConnect).toHaveBeenCalledTimes(1);
    expect(channelDelete).toHaveBeenCalledTimes(3);
    expect(channelDelete).toHaveBeenNthCalledWith(1, '1', true);
    expect(result).toEqual({ deleted: ['1', '2', '3'], failed: [] });
  });

  it('is tolerant of individual failures, continuing with the rest', async () => {
    const channelDelete = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('channel not found'))
      .mockResolvedValueOnce([]);
    mockedConnect.mockResolvedValue({
      on: jest.fn(),
      channelDelete,
      quit: jest.fn().mockResolvedValue(undefined),
    } as never);

    const result = await deleteManagedChannels(['1', '2', '3']);

    expect(result.deleted).toEqual(['1', '3']);
    expect(result.failed).toEqual([{ cid: '2', error: 'channel not found' }]);
  });

  it('invalidates the live-channels cache once finished', async () => {
    mockedConnect.mockResolvedValueOnce({
      on: jest.fn(),
      channelList: jest
        .fn()
        .mockResolvedValue([{ cid: '1', name: 'General', bannerGfxUrl: null }]),
      quit: jest.fn().mockResolvedValue(undefined),
    } as never);
    const cachedBefore = await fetchLiveChannels();
    expect(cachedBefore).toHaveLength(1);

    mockedConnect.mockResolvedValueOnce({
      on: jest.fn(),
      channelDelete: jest.fn().mockResolvedValue([]),
      quit: jest.fn().mockResolvedValue(undefined),
    } as never);
    await deleteManagedChannels(['1']);

    mockedConnect.mockResolvedValueOnce({
      on: jest.fn(),
      channelList: jest.fn().mockResolvedValue([]),
      quit: jest.fn().mockResolvedValue(undefined),
    } as never);
    const refreshed = await fetchLiveChannels();

    expect(mockedConnect).toHaveBeenCalledTimes(3);
    expect(refreshed).toEqual([]);
  });
});

describe('createChannelWallpaper', () => {
  function slice(
    name: string,
    depth: number,
    isSpacer: boolean,
  ): WallpaperChannelSlice {
    return {
      name,
      depth,
      isSpacer,
      bannerUrl: `https://example.test/images/${name}.png`,
    };
  }

  it('creates every slice in order, chaining sibling order at each depth (flat mode)', async () => {
    let nextCid = 100;
    const channelCreate = jest.fn().mockImplementation((name: string) => {
      return Promise.resolve(fakeChannel(String(nextCid++), name));
    });
    const fakeTeamSpeak = { on: jest.fn(), channelCreate, quit: jest.fn() };

    const slices = [
      slice('Art1', 0, false),
      slice('Spacer1', 0, true),
      slice('Art2', 0, false),
    ];
    const result = await createChannelWallpaper(
      fakeTeamSpeak as never,
      '5',
      slices,
    );

    expect(result.created.map((c) => c.name)).toEqual([
      'Art1',
      'Spacer1',
      'Art2',
    ]);
    expect(channelCreate).toHaveBeenNthCalledWith(
      1,
      'Art1',
      expect.objectContaining({ cpid: '5', channelOrder: undefined }),
    );
    expect(channelCreate).toHaveBeenNthCalledWith(
      2,
      'Spacer1',
      expect.objectContaining({ cpid: '5', channelOrder: 100 }),
    );
    expect(channelCreate).toHaveBeenNthCalledWith(
      3,
      'Art2',
      expect.objectContaining({ cpid: '5', channelOrder: 101 }),
    );
  });

  it('nested-spacer mode: a depth-1 row parents under the specific art channel created right before it, not the batch root', async () => {
    let nextCid = 200;
    const channelCreate = jest.fn().mockImplementation((name: string) => {
      return Promise.resolve(fakeChannel(String(nextCid++), name));
    });
    const fakeTeamSpeak = { on: jest.fn(), channelCreate, quit: jest.fn() };

    const slices = [
      slice('Art1', 0, false), // cid 200
      slice('Spacer1', 1, true), // should parent under 200
      slice('Art2', 0, false), // cid 202, parents under batch root
      slice('Spacer2', 1, true), // should parent under 202, NOT under 200
    ];
    await createChannelWallpaper(fakeTeamSpeak as never, '5', slices);

    expect(channelCreate).toHaveBeenNthCalledWith(
      1,
      'Art1',
      expect.objectContaining({ cpid: '5' }),
    );
    expect(channelCreate).toHaveBeenNthCalledWith(
      2,
      'Spacer1',
      expect.objectContaining({ cpid: '200', channelOrder: undefined }),
    );
    expect(channelCreate).toHaveBeenNthCalledWith(
      3,
      'Art2',
      expect.objectContaining({ cpid: '5', channelOrder: 200 }),
    );
    expect(channelCreate).toHaveBeenNthCalledWith(
      4,
      'Spacer2',
      expect.objectContaining({ cpid: '202', channelOrder: undefined }),
    );
  });

  it('stops on a mid-batch failure and reports which rows succeeded/failed, without rollback', async () => {
    const channelCreate = jest
      .fn()
      .mockResolvedValueOnce(fakeChannel('1', 'Art1'))
      .mockRejectedValueOnce(new Error('name already exists'));
    const fakeTeamSpeak = { on: jest.fn(), channelCreate, quit: jest.fn() };

    const slices = [
      slice('Art1', 0, false),
      slice('Art2', 0, false),
      slice('Art3', 0, false),
    ];
    const result = await createChannelWallpaper(
      fakeTeamSpeak as never,
      null,
      slices,
    );

    expect(result.created).toHaveLength(1);
    expect(result.created[0].name).toBe('Art1');
    expect(result.failedAt).toEqual({
      name: 'Art2',
      error: 'name already exists',
    });
    expect(channelCreate).toHaveBeenCalledTimes(2);
  });
});
