import { normalizeChannelName } from './util';

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
