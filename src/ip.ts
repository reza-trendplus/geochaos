import { isIP } from 'node:net';

function v4Number(ip: string): bigint {
  return ip.split('.').reduce((n, part) => (n << 8n) | BigInt(part), 0n);
}
function v6Groups(ip: string): number[] {
  let value = ip;
  if (value.includes('.')) {
    const pos = value.lastIndexOf(':');
    const num = v4Number(value.slice(pos + 1));
    value = value.slice(0, pos + 1) + (num >> 16n).toString(16) + ':' + (num & 65535n).toString(16);
  }
  const [left = '', right] = value.split('::');
  const a = left ? left.split(':').map(p => parseInt(p, 16)) : [];
  if (right === undefined) return a;
  const b = right ? right.split(':').map(p => parseInt(p, 16)) : [];
  return [...a, ...Array<number>(8 - a.length - b.length).fill(0), ...b];
}
export function normalizeIP(input: string): string | null {
  let value = input.trim();
  if (value.startsWith('[') || value.endsWith(']')) {
    if (!value.startsWith('[') || !value.endsWith(']')) return null;
    value = value.slice(1,-1);
  }
  if (value.includes('%')) {
    if (!value.includes(':')) return null;
    value = value.split('%')[0] ?? '';
  }
  const version = isIP(value);
  if (version === 4) return value;
  if (version !== 6) return null;
  const groups = v6Groups(value);
  if (groups.slice(0,5).every(n => n === 0) && groups[5] === 65535) {
    const n = ((groups[6] ?? 0) * 65536) + (groups[7] ?? 0);
    return `${Math.floor(n / 16777216)}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;
  }
  let start = -1, length = 1;
  for (let i = 0; i < groups.length;) {
    if (groups[i] !== 0) { i++; continue; }
    let j = i; while (j < groups.length && groups[j] === 0) j++;
    if (j - i > length) {start = i; length = j - i;}
    i = j;
  }
  const hex = groups.map(n => n.toString(16));
  return start < 0 ? hex.join(':') : `${hex.slice(0,start).join(':')}::${hex.slice(start+length).join(':')}`;
}
function inRange(value: bigint, network: bigint, prefix: number, bits: number): boolean {
  const shift = BigInt(bits - prefix);
  return (value >> shift) === (network >> shift);
}
const V4_DENY: [string, number][] = [
  ['0.0.0.0',8], ['10.0.0.0',8], ['100.64.0.0',10], ['127.0.0.0',8],
  ['169.254.0.0',16], ['172.16.0.0',12], ['192.0.0.0',24], ['192.0.2.0',24],
  ['192.88.99.0',24], ['192.168.0.0',16], ['198.18.0.0',15],
  ['198.51.100.0',24], ['203.0.113.0',24], ['224.0.0.0',4], ['240.0.0.0',4]
];
function v6Number(ip: string): bigint { return v6Groups(ip).reduce((n, p) => (n << 16n) | BigInt(p), 0n); }
/** Conservative lookup eligibility, not an authoritative routing/security classifier. */
export function isPublicIP(input: string): boolean {
  const ip = normalizeIP(input);
  if (!ip) return false;
  if (isIP(ip) === 4) {
    const n = v4Number(ip);
    return !V4_DENY.some(([network,prefix]) => inRange(n,v4Number(network),prefix,32));
  }
  const n = v6Number(ip);
  return inRange(n,v6Number('2000::'),3,128) &&
    !([['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20]] as [string,number][])
      .some(([network,prefix]) => inRange(n,v6Number(network),prefix,128));
}
export function httpOrigin(input: string): string | null {
  try {
    const url = new URL(input);
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : null;
  } catch { return null; }
}
