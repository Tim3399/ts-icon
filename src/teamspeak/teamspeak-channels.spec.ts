import { TeamSpeak } from 'ts3-nodejs-library';
import { fetchLiveChannels } from './teamspeak-channels';

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

afterEach(() => {
  jest.clearAllMocks();
});

describe('fetchLiveChannels', () => {
  it('returns the cid/name of every live channel, connects, and disconnects', async () => {
    const quit = jest.fn().mockResolvedValue(undefined);
    const fakeTeamSpeak = {
      on: jest.fn(),
      channelList: jest.fn().mockResolvedValue([
        { cid: '1', name: 'General' },
        { cid: '2', name: 'Music' },
      ]),
      quit,
    };
    mockedConnect.mockResolvedValue(fakeTeamSpeak as never);

    const result = await fetchLiveChannels();

    expect(result).toEqual([
      { cid: '1', name: 'General' },
      { cid: '2', name: 'Music' },
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
});
