// Fetch for links typed by farmers. Unlike the official list, these can point anywhere,
// so nothing here may reach the server's own network. The check runs when the connection
// opens, on every redirect, so a name that changes its address can't slip past it.
import { lookup } from 'node:dns';
import { BlockList, isIP } from 'node:net';
import { rootCertificates } from 'node:tls';
import { Agent, fetch as undiciFetch } from 'undici';

export const PRIVATE_ADDRESS = 'EPRIVATEADDRESS';
const MAX_HOPS = 5;
const MAX_URL_LENGTH = 2000;

const blocked = new BlockList();
for (const [net, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(net, bits, 'ipv4');
// ::/96 covers loopback and the old IPv4-compatible form. IPv4-mapped addresses meet the rules above.
for (const [net, bits] of [
  ['::', 96], ['64:ff9b::', 96], ['2001:db8::', 32], ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
] as const) blocked.addSubnet(net, bits, 'ipv6');

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  return family !== 0 && !blocked.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

class PrivateAddressError extends Error {
  code = PRIVATE_ADDRESS;
  constructor(host: string) {
    super(`${PRIVATE_ADDRESS} ${host} is not a public address`);
  }
}

const bareHost = (hostname: string) => hostname.replace(/^\[|\]$/g, '');

/** What a farmer typed, as a link we're willing to open, or null. */
export function cleanSourceUrl(text: string): string | null {
  const raw = text.trim();
  if (!raw || raw.length > MAX_URL_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.username || url.password || url.port) return null;
  const host = bareHost(url.hostname);
  if (isIP(host) ? !isPublicAddress(host) : !host.includes('.')) return null;
  url.hash = '';
  return url.toString();
}

/** Connecting to an address skips the name lookup, so those are checked before the request. */
function assertTarget(target: string): void {
  const { hostname, protocol, port } = new URL(target);
  const host = bareHost(hostname);
  if ((protocol !== 'http:' && protocol !== 'https:') || port) throw new PrivateAddressError(hostname);
  if (isIP(host) && !isPublicAddress(host)) throw new PrivateAddressError(hostname);
}

type Found = { address: string; family: number };
type LookupDone = (err: Error | null, address: string | Found[], family?: number) => void;

export function publicLookup(hostname: string, options: { all?: boolean }, done: LookupDone): void {
  lookup(hostname, { all: true }, (err, found) => {
    if (err) return done(err, '');
    if (found.length === 0 || !found.every((f) => isPublicAddress(f.address))) {
      return done(new PrivateAddressError(hostname), '');
    }
    if (options.all) return done(null, found);
    const first = found[0]!;
    done(null, first.address, first.family);
  });
}

/** A fetch that only reaches public addresses. `ca` adds to the trusted roots, for government sites that send incomplete chains. */
export function guardedFetch(ca?: string): typeof fetch {
  const dispatcher = new Agent({ connect: { lookup: publicLookup as never, ...(ca ? { ca: [...rootCertificates, ca] } : {}) } });
  return (async (input: string | URL | Request, init: RequestInit = {}) => {
    let current = input.toString();
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      assertTarget(current);
      const res = await undiciFetch(current, { ...init, redirect: 'manual', dispatcher } as never);
      const location = res.headers.get('location');
      if (init.redirect === 'manual' || res.status < 300 || res.status >= 400 || !location) return res;
      await res.body?.cancel();
      current = new URL(location, current).toString();
    }
    throw new Error('too many redirects');
  }) as typeof fetch;
}
