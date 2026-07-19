import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

export const MAX_CHANNEL_NAME_LENGTH = 100;

/**
 * Validates the raw `:channelName` route parameter shared by the image
 * upload and image-retrieval endpoints. Deliberately does not normalize or
 * transform the value — `normalizeChannelName()` still runs downstream,
 * unchanged, wherever it already did.
 *
 * This is a dedicated pipe rather than a DTO class because Nest's global
 * `ValidationPipe` only validates/transforms an argument whose declared type
 * is a `class-validator`-decorated class. A plain `@Param('channelName')
 * channelName: string` has a native `String` metatype, which
 * `ValidationPipe`'s own `toValidate()` check explicitly skips regardless of
 * `whitelist`/`forbidNonWhitelisted` — those two options only ever reject
 * unrecognized *properties* on an object being validated, and a single
 * route-param string has no properties to whitelist against in the first
 * place. Wrapping it in a one-field DTO just to satisfy the global pipe
 * would add a class with no real whitelisting purpose; a pipe scoped
 * directly to the parameter does the one thing this value actually needs —
 * reject an empty or unreasonably long channel name with a clear 400 —
 * independently of whether the global pipe is even active.
 */
@Injectable()
export class ChannelNameValidationPipe
  implements PipeTransform<string, string>
{
  transform(value: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException('channelName must not be empty');
    }
    if (value.length > MAX_CHANNEL_NAME_LENGTH) {
      throw new BadRequestException(
        `channelName must not exceed ${MAX_CHANNEL_NAME_LENGTH} characters`,
      );
    }
    return value;
  }
}
