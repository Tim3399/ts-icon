import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ImgFromUrlQueryDto } from './img-from-url-query.dto';

async function validateDto(input: Record<string, unknown>) {
  const dto = plainToInstance(ImgFromUrlQueryDto, input);
  return validate(dto);
}

describe('ImgFromUrlQueryDto', () => {
  it('accepts a valid url', async () => {
    const errors = await validateDto({ url: 'https://example.com/a.png' });
    expect(errors).toHaveLength(0);
  });

  it('rejects a missing url', async () => {
    const errors = await validateDto({});
    expect(errors.some((e) => e.property === 'url')).toBe(true);
  });

  it('rejects an empty url', async () => {
    const errors = await validateDto({ url: '' });
    expect(errors.some((e) => e.property === 'url')).toBe(true);
  });

  it('rejects a non-URL string', async () => {
    const errors = await validateDto({ url: 'not-a-url' });
    expect(errors.some((e) => e.property === 'url')).toBe(true);
  });

  it('rejects a url over the max length', async () => {
    const longPath = 'a'.repeat(2100);
    const errors = await validateDto({
      url: `https://example.com/${longPath}`,
    });
    expect(errors.some((e) => e.property === 'url')).toBe(true);
  });
});
