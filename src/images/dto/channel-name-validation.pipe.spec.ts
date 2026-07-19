import { BadRequestException } from '@nestjs/common';
import {
  ChannelNameValidationPipe,
  MAX_CHANNEL_NAME_LENGTH,
} from './channel-name-validation.pipe';

describe('ChannelNameValidationPipe', () => {
  const pipe = new ChannelNameValidationPipe();

  it('passes through a normal channel name unchanged', () => {
    expect(pipe.transform('my-channel')).toBe('my-channel');
  });

  it('rejects an empty string', () => {
    expect(() => pipe.transform('')).toThrow(BadRequestException);
  });

  it('rejects a whitespace-only string', () => {
    expect(() => pipe.transform('   ')).toThrow(BadRequestException);
  });

  it('rejects a value over the max length', () => {
    expect(() =>
      pipe.transform('a'.repeat(MAX_CHANNEL_NAME_LENGTH + 1)),
    ).toThrow(BadRequestException);
  });

  it('accepts a value at exactly the max length', () => {
    const value = 'a'.repeat(MAX_CHANNEL_NAME_LENGTH);
    expect(pipe.transform(value)).toBe(value);
  });
});
