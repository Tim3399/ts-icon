import { normalizeChannelName, isSpacerChannelName } from './util';

describe('normalizeChannelName', () => {
  it('lowercases a plain ASCII name', () => {
    expect(normalizeChannelName('MyChannel')).toBe('mychannel');
  });

  it('transliterates lowercase German umlauts', () => {
    expect(normalizeChannelName('äöü')).toBe('aou');
  });

  it('transliterates uppercase German umlauts', () => {
    expect(normalizeChannelName('ÄÖÜ')).toBe('aou');
  });

  it('transliterates umlauts mixed with other text', () => {
    expect(normalizeChannelName('Überraschung')).toBe('uberraschung');
    expect(normalizeChannelName('Fußballplätze')).toBe('fuballplatze');
  });

  it('replaces whitespace with a hyphen', () => {
    expect(normalizeChannelName('my channel')).toBe('my-channel');
  });

  it('collapses multiple consecutive whitespace characters into a single hyphen', () => {
    expect(normalizeChannelName('my    channel')).toBe('my-channel');
    expect(normalizeChannelName('my\t\nchannel')).toBe('my-channel');
  });

  it('strips punctuation and other disallowed ASCII characters', () => {
    expect(normalizeChannelName('Channel #1!')).toBe('channel-1');
    expect(normalizeChannelName("it's a channel.")).toBe('its-a-channel');
  });

  it('strips emoji', () => {
    expect(normalizeChannelName('party 🎉 room')).toBe('party--room');
  });

  it('strips non-ASCII characters that are not the handled umlauts', () => {
    expect(normalizeChannelName('café résumé')).toBe('caf-rsum');
  });

  it('leaves an already-normalized name unchanged', () => {
    expect(normalizeChannelName('already-normalized-123')).toBe(
      'already-normalized-123',
    );
  });

  it('preserves digits and internal hyphens', () => {
    expect(normalizeChannelName('room-42')).toBe('room-42');
  });

  it('normalizes a name made entirely of stripped characters to an empty string', () => {
    expect(normalizeChannelName('!!!')).toBe('');
    expect(normalizeChannelName('日本語')).toBe('');
  });
});

describe('isSpacerChannelName', () => {
  it('matches when the name is exactly "spacer"', () => {
    expect(isSpacerChannelName('spacer')).toBe(true);
  });

  it('matches "spacer" anywhere in the name, not just as a prefix', () => {
    expect(isSpacerChannelName('afk-spacer-1')).toBe(true);
    expect(isSpacerChannelName('[*spacer0]----------')).toBe(true);
  });

  it('matches regardless of case', () => {
    expect(isSpacerChannelName('SPACER')).toBe(true);
    expect(isSpacerChannelName('[*Spacer1]')).toBe(true);
  });

  it('does not match a channel name without "spacer" in it', () => {
    expect(isSpacerChannelName('lobby')).toBe(false);
    expect(isSpacerChannelName('general-chat')).toBe(false);
  });

  it('does not match an empty name', () => {
    expect(isSpacerChannelName('')).toBe(false);
  });
});
