import * as dns from 'dns';
import * as net from 'net';
import * as https from 'https';
import { URL } from 'url';
import ipaddr from 'ipaddr.js';

/**
 * Thrown whenever a caller-supplied URL is rejected on security grounds
 * (bad scheme, embedded credentials, disallowed port, or the hostname
 * resolves only to addresses that are not safe to connect to from the
 * server). Kept as a distinct type so callers can return a clean 400
 * without leaking exactly which check failed.
 */
export class SsrfValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfValidationError';
  }
}

const ALLOWED_PROTOCOL = 'https:';
const ALLOWED_PORT = '443';

/**
 * Validates the *shape* of an external URL before any network access is
 * attempted: scheme, embedded credentials, and port. Purely syntactic,
 * does not touch the network or DNS.
 */
export function assertSafeUrlShape(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfValidationError('Malformed URL');
  }

  if (parsed.protocol !== ALLOWED_PROTOCOL) {
    throw new SsrfValidationError('Only https:// URLs are allowed');
  }

  if (parsed.username || parsed.password) {
    throw new SsrfValidationError(
      'URLs with embedded credentials are not allowed',
    );
  }

  if (parsed.port && parsed.port !== ALLOWED_PORT) {
    throw new SsrfValidationError('Only the default HTTPS port is allowed');
  }

  return parsed;
}

/**
 * Addresses that are exploited so routinely as SSRF targets that they get
 * an explicit, named rejection even though the generic range checks below
 * would also catch them (defense in depth against a future refactor of the
 * generic checks accidentally loosening one of these).
 */
const KNOWN_METADATA_ADDRESSES = new Set([
  '169.254.169.254', // AWS/GCP/Azure/DigitalOcean/etc. instance metadata (also link-local)
  'fd00:ec2::254', // AWS IMDSv2 IPv6 metadata address (also unique-local)
]);

/**
 * Pure, synchronous check for whether a single literal IP address is safe
 * to connect to from the server. Deliberately side-effect free (no DNS, no
 * network) so it can be unit tested directly against literal addresses.
 *
 * Uses ipaddr.js's built-in range classification rather than hand-rolled
 * CIDR math. ipaddr.js classifies every address into a named range
 * (private, loopback, linkLocal, uniqueLocal, multicast, reserved,
 * carrierGradeNat, ipv4Mapped/6to4/teredo/rfc6145/rfc6052, ...) and falls
 * back to 'unicast' only when nothing else matches -- so "allow only
 * unicast" is a default-deny allowlist, not a denylist that can miss a
 * range. This also blocks IPv6 forms that embed/tunnel an IPv4 address
 * (::ffff:10.0.0.1, 6to4, Teredo, NAT64) instead of only checking the IPv6
 * address's own bits, closing a common filter-bypass trick.
 */
export function isBlockedIp(address: string): boolean {
  if (KNOWN_METADATA_ADDRESSES.has(address)) return true;

  if (net.isIP(address) === 0) {
    // Not a literal IP address at all. Callers should only ever pass
    // addresses that already came out of DNS resolution, so treat anything
    // else as unsafe rather than guessing.
    return true;
  }

  if (!ipaddr.isValid(address)) return true;

  const range = ipaddr.parse(address).range();
  return range !== 'unicast';
}

export interface ResolvedAddress {
  address: string;
  family: number;
}

/**
 * Resolves a hostname to its A/AAAA records and filters out any address
 * that isn't safe to connect to. Throws if resolution fails or if every
 * resolved address is blocked (loopback, private, link-local, multicast,
 * reserved, or cloud metadata). Returns only the safe addresses -- if a
 * hostname resolves to a mix of safe and unsafe addresses, only the safe
 * ones are ever handed to the HTTP client.
 */
export async function resolveSafeAddresses(
  hostname: string,
): Promise<ResolvedAddress[]> {
  let records: dns.LookupAddress[];
  try {
    records = await dns.promises.lookup(hostname, {
      all: true,
      verbatim: true,
    });
  } catch {
    throw new SsrfValidationError('Host could not be resolved');
  }

  const safe = records.filter((record) => !isBlockedIp(record.address));

  if (safe.length === 0) {
    throw new SsrfValidationError('Resolved address is not allowed');
  }

  return safe;
}

type NodeLookupFunction = (
  hostname: string,
  options: dns.LookupOptions,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | dns.LookupAddress[],
    family?: number,
  ) => void,
) => void;

/**
 * Builds an https.Agent whose DNS lookup is pinned to exactly the
 * already-validated addresses -- it never performs a fresh DNS lookup of
 * its own. This closes the TOCTOU gap between "we resolved and validated
 * this hostname" and "the HTTP client opens a socket": without pinning,
 * a second, independent DNS lookup performed later by the HTTP stack could
 * legitimately return a different (and unsafe) address than the one that
 * was checked (e.g. a short-TTL DNS rebinding attack). The TLS handshake
 * still validates the certificate against the original hostname, since
 * that comes from the request's `host`/SNI, not from the lookup function.
 */
export function createPinnedHttpsAgent(
  safeAddresses: ResolvedAddress[],
): https.Agent {
  const lookup: NodeLookupFunction = (_hostname, options, callback) => {
    if (options && options.all) {
      callback(
        null,
        safeAddresses.map((a) => ({ address: a.address, family: a.family })),
      );
      return;
    }
    const [first] = safeAddresses;
    callback(null, first.address, first.family);
  };

  return new https.Agent({ lookup, keepAlive: false });
}
