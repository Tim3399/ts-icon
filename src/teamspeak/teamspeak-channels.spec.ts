import { TeamSpeak } from 'ts3-nodejs-library';
import {
  fetchLiveChannels,
  expectedBannerUrl,
  isManagedByUs,
  setChannelBannerUrl,
  applyBannerUrlsForAllChannels,
  invalidateLiveChannelsCache,
  computeChannelDepth,
  type LiveChannel,
} from './teamspeak-channels';

jest.mock('ts3-nodejs-library', () => ({
  TeamSpeak: { connect: jest.fn() },
  // Mirrors the real library's QueryProtocol enum values (both are plain
  // strings under the hood) since PROTOCOL_MAP in the module under test
  // reads these at module-load time.
  QueryProtocol: { RAW: 'raw', SSH: 'ssh' },
}));

jest.mock('../../config', () => ({
  ...jest.requireActual<typeof import('../../config')>('../../config'),
  getTeamSpeakCredentials: jest.fn(() => ({
    username: 'user',
    password: 'pass',
  })),
}));

// `jest.spyOn` (rather than a direct `TeamSpeak.connect` property read) avoids
// @typescript-eslint/unbound-method, matching the existing pattern in
// images.controller.local.spec.ts.
const mockedConnect = jest.spyOn(TeamSpeak, 'connect');

beforeEach(() => {
  invalidateLiveChannelsCache();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('fetchLiveChannels', () => {
  it('returns the cid/name/bannerGfxUrl of every live channel, connects, and disconnects', async () => {
    const quit = jest.fn().mockResolvedValue(undefined);
    const fakeTeamSpeak = {
      on: jest.fn(),
      channelList: jest.fn().mockResolvedValue([
        {
          cid: '1',
          name: 'General',
          bannerGfxUrl: 'https://example.test/images/general',
        },
        { cid: '2', name: 'Music' },
      ]),
      quit,
    };
    mockedConnect.mockResolvedValue(fakeTeamSpeak as never);

    const result = await fetchLiveChannels();

    expect(result).toEqual([
      {
        cid: '1',
        name: 'General',
        bannerGfxUrl: 'https://example.test/images/general',
        pid: null,
      },
      { cid: '2', name: 'Music', bannerGfxUrl: null, pid: null },
    ]);
    expect(quit).toHaveBeenCalledTimes(1);
  });

  it('propagates a connection failure rather than swallowing it', async () => {
    mockedConnect.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(fetchLiveChannels()).rejects.toThrow('ECONNREFUSED');
  });

  it('returns an empty array when no channels exist', async () => {
    const fakeTeamSpeak = {
      on: jest.fn(),
      channelList: jest.fn().mockResolvedValue([]),
      quit: jest.fn().mockResolvedValue(undefined),
    };
    mockedConnect.mockResolvedValue(fakeTeamSpeak as never);

    const result = await fetchLiveChannels();

    expect(result).toEqual([]);
  });

  it('dedupes concurrent calls into a single connection attempt', async () => {
    let resolveConnect!: (value: unknown) => void;
    mockedConnect.mockReturnValue(
      new Promise((resolve) => {
        resolveConnect = resolve;
      }) as never,
    );

    // Both calls start before either has a chance to resolve, so if the
    // in-flight guard didn't exist, each would independently call
    // TeamSpeak.connect().
    const first = fetchLiveChannels();
    const second = fetchLiveChannels();

    const fakeTeamSpeak = {
      on: jest.fn(),
      channelList: jest.fn().mockResolvedValue([{ cid: '1', name: 'General' }]),
      quit: jest.fn().mockResolvedValue(undefined),
    };
    resolveConnect(fakeTeamSpeak);

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(mockedConnect).toHaveBeenCalledTimes(1);
    expect(firstResult).toEqual([
      { cid: '1', name: 'General', bannerGfxUrl: null, pid: null },
    ]);
    expect(secondResult).toEqual(firstResult);
  });

  it('returns the cached result for a second call within the TTL, without reconnecting', async () => {
    const fakeTeamSpeak = {
      on: jest.fn(),
      channelList: jest.fn().mockResolvedValue([{ cid: '1', name: 'General' }]),
      quit: jest.fn().mockResolvedValue(undefined),
    };
    mockedConnect.mockResolvedValue(fakeTeamSpeak as never);

    const first = await fetchLiveChannels();
    const second = await fetchLiveChannels();

    expect(mockedConnect).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('starts a fresh connection once the cache TTL has expired', async () => {
    const fakeTeamSpeak = {
      on: jest.fn(),
      channelList: jest.fn().mockResolvedValue([]),
      quit: jest.fn().mockResolvedValue(undefined),
    };
    mockedConnect.mockResolvedValue(fakeTeamSpeak as never);

    jest.useFakeTimers();
    try {
      await fetchLiveChannels();
      // 30_000ms is CACHE_TTL_MS -- advance strictly past it.
      jest.advanceTimersByTime(30_001);
      await fetchLiveChannels();
    } finally {
      jest.useRealTimers();
    }

    expect(mockedConnect).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failed fetch, so the next call retries', async () => {
    mockedConnect.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(fetchLiveChannels()).rejects.toThrow('ECONNREFUSED');

    const fakeTeamSpeak = {
      on: jest.fn(),
      channelList: jest.fn().mockResolvedValue([]),
      quit: jest.fn().mockResolvedValue(undefined),
    };
    mockedConnect.mockResolvedValueOnce(fakeTeamSpeak as never);

    const result = await fetchLiveChannels();

    expect(result).toEqual([]);
    expect(mockedConnect).toHaveBeenCalledTimes(2);
  });
});

const PUBLIC_BASE_URL = 'https://ts-icon.example.test';

describe('expectedBannerUrl', () => {
  it('composes the public base URL with the normalized channel name under /images/, suffixed with .png', () => {
    // TeamSpeak 6 only renders a banner from a URL with a recognized image
    // file extension -- it doesn't consult Content-Type like a browser
    // does. Every stored image is always re-encoded to canonical PNG
    // regardless of what was uploaded, so this suffix is never a lie.
    expect(expectedBannerUrl('Röhre 1', PUBLIC_BASE_URL)).toBe(
      `${PUBLIC_BASE_URL}/images/rohre-1.png`,
    );
  });
});

describe('isManagedByUs', () => {
  it('returns true when the channel banner already matches the expected URL', () => {
    const channel: LiveChannel = {
      cid: '1',
      name: 'General',
      bannerGfxUrl: `${PUBLIC_BASE_URL}/images/general.png`,
      pid: null,
    };
    expect(isManagedByUs(channel, PUBLIC_BASE_URL)).toBe(true);
  });

  it('returns false when the channel has no banner set', () => {
    const channel: LiveChannel = {
      cid: '1',
      name: 'General',
      bannerGfxUrl: null,
      pid: null,
    };
    expect(isManagedByUs(channel, PUBLIC_BASE_URL)).toBe(false);
  });

  it('returns false when the channel banner points somewhere else', () => {
    const channel: LiveChannel = {
      cid: '1',
      name: 'General',
      bannerGfxUrl: 'https://someone-elses-host.example/banner.png',
      pid: null,
    };
    expect(isManagedByUs(channel, PUBLIC_BASE_URL)).toBe(false);
  });

  it('returns false for the old, pre-fix extensionless URL, so applyBannerUrlsForAllChannels rewrites it', () => {
    // Regression coverage for the TS6-doesn't-render-extensionless-banners
    // bug: a channel still pointed at the URL shape expectedBannerUrl()
    // produced before it started appending .png must be treated as *not*
    // managed, so the existing "apply to every channel" bulk action is what
    // migrates it to the new, working URL -- no separate one-off migration
    // script needed.
    const channel: LiveChannel = {
      cid: '1',
      name: 'General',
      bannerGfxUrl: `${PUBLIC_BASE_URL}/images/general`,
      pid: null,
    };
    expect(isManagedByUs(channel, PUBLIC_BASE_URL)).toBe(false);
  });
});

describe('computeChannelDepth', () => {
  const flatChannels: LiveChannel[] = [
    { cid: '1', name: 'A', bannerGfxUrl: null, pid: null },
    { cid: '2', name: 'B', bannerGfxUrl: null, pid: null },
  ];

  const nestedChannels: LiveChannel[] = [
    { cid: '1', name: 'Root', bannerGfxUrl: null, pid: null },
    { cid: '2', name: 'Child', bannerGfxUrl: null, pid: '1' },
    { cid: '3', name: 'Grandchild', bannerGfxUrl: null, pid: '2' },
  ];

  it('returns -1 for a null cid (no parent chosen, i.e. top-level)', () => {
    expect(computeChannelDepth(null, flatChannels)).toBe(-1);
  });

  it('returns 0 for a top-level channel', () => {
    expect(computeChannelDepth('1', flatChannels)).toBe(0);
  });

  it('returns 0 for the root of a nested tree', () => {
    expect(computeChannelDepth('1', nestedChannels)).toBe(0);
  });

  it('returns 1 for a direct child', () => {
    expect(computeChannelDepth('2', nestedChannels)).toBe(1);
  });

  it('returns 2 for a grandchild', () => {
    expect(computeChannelDepth('3', nestedChannels)).toBe(2);
  });

  it('returns -1 for a cid that does not exist in the given channel list', () => {
    expect(computeChannelDepth('unknown', nestedChannels)).toBe(-1);
  });
});

describe('setChannelBannerUrl', () => {
  it('connects, calls channelEdit with the given cid/url, and disconnects', async () => {
    const quit = jest.fn().mockResolvedValue(undefined);
    const channelEdit = jest.fn().mockResolvedValue([]);
    const fakeTeamSpeak = { on: jest.fn(), channelEdit, quit };
    mockedConnect.mockResolvedValue(fakeTeamSpeak as never);

    await setChannelBannerUrl('42', `${PUBLIC_BASE_URL}/images/general`);

    expect(channelEdit).toHaveBeenCalledWith('42', {
      channelBannerGfxUrl: `${PUBLIC_BASE_URL}/images/general`,
    });
    expect(quit).toHaveBeenCalledTimes(1);
  });

  it('still disconnects if channelEdit itself fails', async () => {
    const quit = jest.fn().mockResolvedValue(undefined);
    const channelEdit = jest
      .fn()
      .mockRejectedValue(new Error('rejected by server'));
    const fakeTeamSpeak = { on: jest.fn(), channelEdit, quit };
    mockedConnect.mockResolvedValue(fakeTeamSpeak as never);

    await expect(
      setChannelBannerUrl('42', 'https://x.test/images/y'),
    ).rejects.toThrow('rejected by server');
    expect(quit).toHaveBeenCalledTimes(1);
  });

  it('invalidates the live-channels cache, so a refresh right after reflects the new banner URL', async () => {
    // Regression test: setChannelBannerUrl() used to leave fetchLiveChannels()'s
    // cache untouched, so the normal admin-UI workflow of "set banner URL,
    // then refresh the channel list" showed the *pre-update* bannerGfxUrl
    // (and therefore `managed: false`) for up to CACHE_TTL_MS after a
    // successful update.
    mockedConnect.mockResolvedValueOnce({
      on: jest.fn(),
      channelList: jest
        .fn()
        .mockResolvedValue([
          { cid: '42', name: 'general', bannerGfxUrl: null },
        ]),
      quit: jest.fn().mockResolvedValue(undefined),
    } as never);
    const cachedBefore = await fetchLiveChannels();
    expect(cachedBefore[0].bannerGfxUrl).toBeNull();

    mockedConnect.mockResolvedValueOnce({
      on: jest.fn(),
      channelEdit: jest.fn().mockResolvedValue([]),
      quit: jest.fn().mockResolvedValue(undefined),
    } as never);
    await setChannelBannerUrl('42', `${PUBLIC_BASE_URL}/images/general`);

    mockedConnect.mockResolvedValueOnce({
      on: jest.fn(),
      channelList: jest.fn().mockResolvedValue([
        {
          cid: '42',
          name: 'general',
          bannerGfxUrl: `${PUBLIC_BASE_URL}/images/general`,
        },
      ]),
      quit: jest.fn().mockResolvedValue(undefined),
    } as never);
    const refreshed = await fetchLiveChannels();

    expect(mockedConnect).toHaveBeenCalledTimes(3);
    expect(refreshed[0].bannerGfxUrl).toBe(`${PUBLIC_BASE_URL}/images/general`);
  });
});

describe('applyBannerUrlsForAllChannels', () => {
  it('updates only channels not already managed, leaving the rest alone', async () => {
    const channelEdit = jest.fn().mockResolvedValue([]);
    const fakeTeamSpeak = {
      on: jest.fn(),
      channelList: jest.fn().mockResolvedValue([
        {
          cid: '1',
          name: 'General',
          bannerGfxUrl: `${PUBLIC_BASE_URL}/images/general.png`,
        },
        { cid: '2', name: 'Music', bannerGfxUrl: null },
        {
          cid: '3',
          name: 'Röhre',
          bannerGfxUrl: 'https://elsewhere.test/x.png',
        },
      ]),
      channelEdit,
      quit: jest.fn().mockResolvedValue(undefined),
    };
    mockedConnect.mockResolvedValue(fakeTeamSpeak as never);

    const result = await applyBannerUrlsForAllChannels(PUBLIC_BASE_URL);

    expect(result.alreadyManaged).toEqual(['General']);
    expect(result.updated).toEqual(['Music', 'Röhre']);
    expect(channelEdit).toHaveBeenCalledTimes(2);
    expect(channelEdit).toHaveBeenCalledWith('2', {
      channelBannerGfxUrl: `${PUBLIC_BASE_URL}/images/music.png`,
    });
    expect(channelEdit).toHaveBeenCalledWith('3', {
      channelBannerGfxUrl: `${PUBLIC_BASE_URL}/images/rohre.png`,
    });
  });

  it('uses a single connection for the whole batch', async () => {
    const fakeTeamSpeak = {
      on: jest.fn(),
      channelList: jest.fn().mockResolvedValue([
        { cid: '1', name: 'A', bannerGfxUrl: null },
        { cid: '2', name: 'B', bannerGfxUrl: null },
      ]),
      channelEdit: jest.fn().mockResolvedValue([]),
      quit: jest.fn().mockResolvedValue(undefined),
    };
    mockedConnect.mockResolvedValue(fakeTeamSpeak as never);

    await applyBannerUrlsForAllChannels(PUBLIC_BASE_URL);

    expect(mockedConnect).toHaveBeenCalledTimes(1);
  });

  it('returns empty arrays when there are no live channels', async () => {
    const fakeTeamSpeak = {
      on: jest.fn(),
      channelList: jest.fn().mockResolvedValue([]),
      channelEdit: jest.fn(),
      quit: jest.fn().mockResolvedValue(undefined),
    };
    mockedConnect.mockResolvedValue(fakeTeamSpeak as never);

    const result = await applyBannerUrlsForAllChannels(PUBLIC_BASE_URL);

    expect(result).toEqual({ updated: [], alreadyManaged: [] });
  });

  it('invalidates the live-channels cache, so a refresh right after reflects the newly-applied banner URLs', async () => {
    mockedConnect.mockResolvedValueOnce({
      on: jest.fn(),
      channelList: jest
        .fn()
        .mockResolvedValue([{ cid: '1', name: 'general', bannerGfxUrl: null }]),
      quit: jest.fn().mockResolvedValue(undefined),
    } as never);
    const cachedBefore = await fetchLiveChannels();
    expect(cachedBefore[0].bannerGfxUrl).toBeNull();

    mockedConnect.mockResolvedValueOnce({
      on: jest.fn(),
      channelList: jest
        .fn()
        .mockResolvedValue([{ cid: '1', name: 'general', bannerGfxUrl: null }]),
      channelEdit: jest.fn().mockResolvedValue([]),
      quit: jest.fn().mockResolvedValue(undefined),
    } as never);
    await applyBannerUrlsForAllChannels(PUBLIC_BASE_URL);

    mockedConnect.mockResolvedValueOnce({
      on: jest.fn(),
      channelList: jest.fn().mockResolvedValue([
        {
          cid: '1',
          name: 'general',
          bannerGfxUrl: `${PUBLIC_BASE_URL}/images/general`,
        },
      ]),
      quit: jest.fn().mockResolvedValue(undefined),
    } as never);
    const refreshed = await fetchLiveChannels();

    expect(mockedConnect).toHaveBeenCalledTimes(3);
    expect(refreshed[0].bannerGfxUrl).toBe(`${PUBLIC_BASE_URL}/images/general`);
  });
});
