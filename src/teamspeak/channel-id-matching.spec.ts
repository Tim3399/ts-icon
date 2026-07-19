import { matchChannelIdsToRows } from './channel-id-matching';
import type { LiveChannel } from './teamspeak-channels';

describe('matchChannelIdsToRows', () => {
  it('matches a row to a live channel whose normalized name equals the row channelName', () => {
    const rows = [{ channelName: 'general' }];
    const liveChannels: LiveChannel[] = [{ cid: '1', name: 'General' }];

    const result = matchChannelIdsToRows(rows, liveChannels);

    expect(result.matched).toEqual([
      { channelName: 'general', channelId: '1' },
    ]);
    expect(result.unmatched).toEqual([]);
  });

  it('normalizes live channel names the same way the rest of the app does (umlauts, whitespace, punctuation)', () => {
    const rows = [{ channelName: 'rohre' }];
    const liveChannels: LiveChannel[] = [{ cid: '42', name: 'Röhre!!!' }];

    const result = matchChannelIdsToRows(rows, liveChannels);

    expect(result.matched).toEqual([{ channelName: 'rohre', channelId: '42' }]);
    expect(result.unmatched).toEqual([]);
  });

  it('reports a row with no live match at all as unmatched, not an error', () => {
    const rows = [{ channelName: 'deleted-channel' }];
    const liveChannels: LiveChannel[] = [{ cid: '1', name: 'Something Else' }];

    const result = matchChannelIdsToRows(rows, liveChannels);

    expect(result.matched).toEqual([]);
    expect(result.unmatched).toEqual(['deleted-channel']);
  });

  it('handles a mix of matched and unmatched rows in the same run', () => {
    const rows = [
      { channelName: 'general' },
      { channelName: 'gone' },
      { channelName: 'music' },
    ];
    const liveChannels: LiveChannel[] = [
      { cid: '1', name: 'General' },
      { cid: '2', name: 'Music' },
    ];

    const result = matchChannelIdsToRows(rows, liveChannels);

    expect(result.matched).toEqual(
      expect.arrayContaining([
        { channelName: 'general', channelId: '1' },
        { channelName: 'music', channelId: '2' },
      ]),
    );
    expect(result.matched).toHaveLength(2);
    expect(result.unmatched).toEqual(['gone']);
  });

  it('returns everything unmatched when there are no live channels at all', () => {
    const rows = [{ channelName: 'general' }, { channelName: 'music' }];

    const result = matchChannelIdsToRows(rows, []);

    expect(result.matched).toEqual([]);
    expect(result.unmatched).toEqual(['general', 'music']);
  });

  it('returns nothing at all when there are no rows to match', () => {
    const liveChannels: LiveChannel[] = [{ cid: '1', name: 'General' }];

    const result = matchChannelIdsToRows([], liveChannels);

    expect(result.matched).toEqual([]);
    expect(result.unmatched).toEqual([]);
  });

  it('two different live channels normalizing to the same name only ever match the last one seen (the exact collision this migration exists to guard against downstream)', () => {
    // "Röhre" and "Rohre" both normalize to "rohre" — this is the collision
    // risk documented for this migration. The pure matching function itself
    // doesn't need to detect or reject this (that's the upload-path's job
    // going forward); it just deterministically picks one, via whichever
    // live channel is later in the array overwriting the map entry.
    const rows = [{ channelName: 'rohre' }];
    const liveChannels: LiveChannel[] = [
      { cid: '1', name: 'Röhre' },
      { cid: '2', name: 'Rohre' },
    ];

    const result = matchChannelIdsToRows(rows, liveChannels);

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].channelId).toBe('2');
  });
});
