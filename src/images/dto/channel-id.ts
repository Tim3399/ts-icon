import { BadRequestException } from "@nestjs/common";

/** Accepts the stable CID used by admin routes and its public PNG URL form. */
export function parseChannelId(value: string): string {
  const cid = value.replace(/\.png$/i, "");
  if (!/^[1-9][0-9]{0,19}$/.test(cid)) throw new BadRequestException("Invalid channel ID");
  return cid;
}
