import { normalizeASN } from './config.js';
import { isPublicIP, normalizeIP } from './ip.js';
import type { GeoRecord } from './types.js';

export interface IP2LocationOptions {
  apiKey?: string;
  allowKeyless?: boolean;
  timeoutMs?: number;
  maxLookups?: number;
  /** Dependency injection for tests; production always uses the fixed HTTPS endpoint. */
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}
function empty(ip: string, status: GeoRecord['status'], reason: string): GeoRecord {
  return {ip, status, reason, source:'none', countryCode:null, countryName:null, asn:null, asName:null};
}
function clean(value: unknown): string | null {
  return typeof value === 'string' && value.trim() && value.trim() !== '-'
    ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 180) : null;
}
export class IP2LocationClient {
  private readonly cache = new Map<string, Promise<GeoRecord>>();
  private readonly request: typeof fetch;
  private disabledReason: string | null = null;
  private calls = 0;
  constructor(private readonly options: IP2LocationOptions = {}) {
    if (!options.apiKey && !options.allowKeyless)
      throw new Error('Set IP2LOCATION_API_KEY, or explicitly enable keyless mode. The demo does not need a key.');
    this.request = options.fetchImpl ?? fetch;
  }
  get lookupCount(): number { return this.calls; }
  lookup(input: string): Promise<GeoRecord> {
    const ip = normalizeIP(input);
    if (!ip) return Promise.resolve(empty(input, 'unknown', 'Invalid observed IP address.'));
    if (!isPublicIP(ip)) return Promise.resolve(empty(ip, 'non-public', 'Non-public or special-use IP; no API request sent.'));
    const cached = this.cache.get(ip);
    if (cached) return cached;
    if (this.disabledReason) return Promise.resolve(empty(ip, 'error', this.disabledReason));
    if (this.calls >= (this.options.maxLookups ?? 200))
      return Promise.resolve(empty(ip, 'error', 'Per-run IP lookup budget exhausted.'));
    this.calls++;
    const result = this.fetchRecord(ip);
    this.cache.set(ip, result);
    return result;
  }
  private async fetchRecord(ip: string): Promise<GeoRecord> {
    const url = new URL('https://api.ip2location.io/');
    url.searchParams.set('ip', ip);
    url.searchParams.set('format', 'json');
    const headers: Record<string,string> = {'Accept':'application/json'};
    if (this.options.apiKey) headers.Authorization = `Bearer ${this.options.apiKey}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (this.options.signal?.aborted) return empty(ip, 'error', 'Lookup cancelled.');
      const timeout = AbortSignal.timeout(this.options.timeoutMs ?? 5000);
      const signal = this.options.signal ? AbortSignal.any([timeout, this.options.signal]) : timeout;
      try {
        const response = await this.request(url, {headers, signal, redirect:'error'});
        if (response.status === 401 || response.status === 403) {
          this.disabledReason = `IP2Location authentication/access error (HTTP ${response.status}).`;
          return empty(ip, 'error', this.disabledReason);
        }
        if (response.status === 429 || response.status >= 500) {
          await response.body?.cancel();
          if (attempt === 0) {await new Promise(resolve => setTimeout(resolve, 250)); continue;}
          if (response.status === 429) this.disabledReason = 'IP2Location rate limit reached.';
          return empty(ip, 'error', `IP2Location unavailable (HTTP ${response.status}); not classified.`);
        }
        if (!response.ok) return empty(ip, 'error', `IP2Location HTTP ${response.status}; not classified.`);
        const body: unknown = await response.json();
        if (!body || typeof body !== 'object' || Array.isArray(body))
          return empty(ip, 'error', 'Malformed IP2Location response.');
        const data = body as Record<string, unknown>;
        if (data.error) return empty(ip, 'error', 'IP2Location returned an API error; check your key, quota and account.');
        if (typeof data.ip !== 'string' || normalizeIP(data.ip) !== ip)
          return empty(ip, 'error', 'IP2Location response IP did not match the requested IP.');
        const code = clean(data.country_code)?.toUpperCase() ?? null;
        const countryCode = code && /^[A-Z]{2}$/.test(code) && code !== 'ZZ' ? code : null;
        const asn = normalizeASN(data.asn);
        return {
          ip, countryCode, countryName: countryCode ? clean(data.country_name) : null,
          asn, asName: asn ? clean(data.as) : null, source:'ip2location',
          status: countryCode || asn ? 'ok' : 'unknown', lookedUpAt:new Date().toISOString(),
          ...(!countryCode && !asn ? {reason:'No usable country or ASN in the response.'} : {})
        };
      } catch {
        if (attempt === 0 && !this.options.signal?.aborted) continue;
        return empty(ip, 'error', 'IP2Location request failed, timed out or returned invalid JSON.');
      }
    }
    return empty(ip, 'error', 'IP2Location lookup failed.');
  }
}
export async function mapLimited<T,R>(items: T[], concurrency: number, fn: (item:T) => Promise<R>): Promise<R[]> {
  const result: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({length:Math.min(concurrency,items.length)}, async () => {
    while (next < items.length) {const index = next++; result[index] = await fn(items[index]!);}
  }));
  return result;
}
