import { ValidationPipe, type ArgumentMetadata } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ImageFromUrlDto } from './image-from-url.dto';

async function validateDto(input: Record<string, unknown>) {
  const dto = plainToInstance(ImageFromUrlDto, input);
  return validate(dto);
}

const bodyMetadata: ArgumentMetadata = {
  type: 'body',
  metatype: ImageFromUrlDto,
  data: undefined,
};

describe('ImageFromUrlDto', () => {
  it('accepts a valid payload', async () => {
    const errors = await validateDto({
      channelName: 'my-channel',
      url: 'https://example.com/a.png',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects a missing channelName', async () => {
    const errors = await validateDto({ url: 'https://example.com/a.png' });
    expect(errors.some((e) => e.property === 'channelName')).toBe(true);
  });

  it('rejects an empty channelName', async () => {
    const errors = await validateDto({
      channelName: '',
      url: 'https://example.com/a.png',
    });
    expect(errors.some((e) => e.property === 'channelName')).toBe(true);
  });

  it('rejects a channelName over the max length', async () => {
    const errors = await validateDto({
      channelName: 'a'.repeat(101),
      url: 'https://example.com/a.png',
    });
    expect(errors.some((e) => e.property === 'channelName')).toBe(true);
  });

  it('accepts a channelName at exactly the max length', async () => {
    const errors = await validateDto({
      channelName: 'a'.repeat(100),
      url: 'https://example.com/a.png',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects a non-URL string', async () => {
    const errors = await validateDto({
      channelName: 'my-channel',
      url: 'not-a-url',
    });
    expect(errors.some((e) => e.property === 'url')).toBe(true);
  });

  it('rejects an empty url', async () => {
    const errors = await validateDto({ channelName: 'my-channel', url: '' });
    expect(errors.some((e) => e.property === 'url')).toBe(true);
  });

  describe('with the global ValidationPipe configuration', () => {
    // Exercises the exact pipe options main.local.ts/main.public.ts register
    // globally (`transform: true, whitelist: true, forbidNonWhitelisted:
    // true`), not just bare class-validator, since that's what actually
    // determines request behavior once the pipe is wired up.
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    it('accepts and transforms a valid plain body into a DTO instance', async () => {
      const result = (await pipe.transform(
        { channelName: 'my-channel', url: 'https://example.com/a.png' },
        bodyMetadata,
      )) as ImageFromUrlDto;
      expect(result).toBeInstanceOf(ImageFromUrlDto);
      expect(result.channelName).toBe('my-channel');
    });

    it('rejects a body containing an unrecognized field', async () => {
      await expect(
        pipe.transform(
          {
            channelName: 'my-channel',
            url: 'https://example.com/a.png',
            extra: 'nope',
          },
          bodyMetadata,
        ),
      ).rejects.toThrow();
    });

    it('rejects a body missing required fields', async () => {
      await expect(
        pipe.transform({ channelName: 'my-channel' }, bodyMetadata),
      ).rejects.toThrow();
    });
  });
});
