import { resolve } from 'node:path';
import type { GeoChaosConfig, GroupBy, NormalizedConfig, SyntheticLocation } from './types.js';

export function defineConfig(config: GeoChaosConfig): GeoChaosConfig { return config; }
function fail(message: string): never { throw new Error(`Invalid GeoChaos config: ${message}`); }
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, fallback?: string): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a nonempty string.`);
  return value.trim();
}
function boolean(value: unknown, label: string, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') fail(`${label} must be a boolean.`);
  return value;
}
function integer(value: unknown, label: string, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    fail(`${label} must be an integer from ${min} to ${max}.`);
  return value;
}
function strings(value: unknown, label: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(`${label} must be an array of strings.`);
  return [...new Set(value.map((v, i) => text(v, `${label}[${i}]`)))];
}
function allowedKeys(o: Record<string, unknown>, keys: string[], label: string): void {
  for (const key of Object.keys(o)) if (!keys.includes(key)) fail(`unknown ${label} option "${key}".`);
}
export function normalizeOrigin(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { fail('origins must be absolute HTTP(S) URLs.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
    (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash)
    fail('origins must contain only scheme, hostname and optional port; no path, credentials or query.');
  return url.origin;
}
export function normalizeASN(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).replace(/^AS/i, '');
  if (!/^\d{1,10}$/.test(raw)) return null;
  const number = Number(raw);
  return number > 0 && number <= 4294967295 ? String(number) : null;
}
export function normalizeConfig(input: unknown, cwd = process.cwd()): NormalizedConfig {
  const c = object(input, 'config');
  allowedKeys(c, ['name','notes','baseURL','journeys','firstPartyOrigins','excludeOrigins','groupBy',
    'countries','asns','maxScenarios','baselineRuns','scenarioRuns','actionTimeoutMs',
    'stepTimeoutMs','settleMs','outputDir','screenshots','screenshotMasks','diagnostics',
    'redact','browser','geo'], 'top-level');
  const baseURL = text(c.baseURL, 'baseURL');
  let base: URL;
  try { base = new URL(baseURL); } catch { fail('baseURL must be an absolute HTTP(S) URL.'); }
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password)
    fail('baseURL must be HTTP(S), without embedded credentials.');
  if (!Array.isArray(c.journeys) || !c.journeys.length) fail('provide at least one journey.');
  const names = new Set<string>();
  const journeys = c.journeys.map((raw, i) => {
    const j = object(raw, `journeys[${i}]`);
    allowedKeys(j, ['name', 'steps'], 'journey');
    const name = text(j.name, `journeys[${i}].name`);
    if (names.has(name)) fail('journey names must be unique.');
    names.add(name);
    if (!Array.isArray(j.steps) || !j.steps.length) fail(`journey "${name}" needs steps.`);
    const stepNames = new Set<string>();
    const steps = j.steps.map((rawStep, index) => {
      const s = object(rawStep, `steps[${index}]`);
      allowedKeys(s, ['name', 'run'], 'step');
      const stepName = text(s.name, 'step.name');
      if (stepNames.has(stepName)) fail(`step names in "${name}" must be unique.`);
      stepNames.add(stepName);
      if (typeof s.run !== 'function') fail(`step "${stepName}" needs a run function.`);
      return { name: stepName, run: s.run as GeoChaosConfig['journeys'][number]['steps'][number]['run'] };
    });
    return { name, steps };
  });
  const groupBy = c.groupBy === undefined ? ['country', 'asn'] : strings(c.groupBy, 'groupBy');
  if (!groupBy.length || groupBy.some(g => !['country', 'asn'].includes(g)))
    fail('groupBy must contain country and/or asn.');
  const countries = strings(c.countries, 'countries').map(v => v.toUpperCase());
  if (countries.some(v => !/^[A-Z]{2}$/.test(v) || v === 'ZZ')) fail('countries must be two-letter country codes.');
  const asns = strings(c.asns, 'asns').map(v => normalizeASN(v));
  if (asns.includes(null)) fail('asns must be valid AS numbers.');
  if (countries.length && !groupBy.includes('country')) fail('countries requires country in groupBy.');
  if (asns.length && !groupBy.includes('asn')) fail('asns requires asn in groupBy.');
  const browser = c.browser === undefined ? {} : object(c.browser, 'browser');
  allowedKeys(browser, ['headless','executablePath','viewport'], 'browser');
  const viewport = browser.viewport === undefined ? {} : object(browser.viewport, 'browser.viewport');
  allowedKeys(viewport, ['width','height'], 'viewport');
  const geo = c.geo === undefined ? {} : object(c.geo, 'geo');
  allowedKeys(geo, ['mode','allowKeyless','timeoutMs','maxLookups','fixtures'], 'geo');
  const mode = geo.mode ?? 'live';
  if (mode !== 'live' && mode !== 'synthetic') fail('geo.mode must be live or synthetic.');
  if (mode === 'live' && geo.fixtures !== undefined && Object.keys(object(geo.fixtures, 'geo.fixtures')).length)
    fail('fixtures are only allowed in explicitly synthetic mode.');
  const fixtures: Record<string, SyntheticLocation> = {};
  if (geo.fixtures !== undefined) {
    for (const [origin, raw] of Object.entries(object(geo.fixtures, 'geo.fixtures'))) {
      const f = object(raw, 'fixture');
      allowedKeys(f, ['countryCode','countryName','asn','asName'], 'fixture');
      const countryCode = text(f.countryCode, 'fixture.countryCode').toUpperCase();
      const asn = normalizeASN(f.asn);
      if (!/^[A-Z]{2}$/.test(countryCode) || countryCode === 'ZZ' || !asn) fail('invalid synthetic country or ASN.');
      fixtures[normalizeOrigin(origin)] = {countryCode, asn,
        countryName: text(f.countryName, 'fixture.countryName'), asName: text(f.asName, 'fixture.asName')};
    }
  }
  const screenshots = c.screenshots ?? 'all';
  if (!['all','failures','off'].includes(String(screenshots))) fail('screenshots must be all, failures or off.');
  const executable = browser.executablePath ?? process.env.GEOCHAOS_CHROMIUM_PATH;
  return {
    name: text(c.name, 'name', 'GeoChaos experiment'), notes: strings(c.notes, 'notes'), baseURL, journeys,
    firstPartyOrigins: [...new Set([base.origin, ...strings(c.firstPartyOrigins, 'firstPartyOrigins').map(normalizeOrigin)])],
    excludeOrigins: strings(c.excludeOrigins, 'excludeOrigins').map(normalizeOrigin),
    groupBy: groupBy as GroupBy[], countries, asns: asns as string[],
    maxScenarios: integer(c.maxScenarios, 'maxScenarios', 12, 1, 100),
    baselineRuns: integer(c.baselineRuns, 'baselineRuns', 2, 1, 5),
    scenarioRuns: integer(c.scenarioRuns, 'scenarioRuns', 1, 1, 5),
    actionTimeoutMs: integer(c.actionTimeoutMs, 'actionTimeoutMs', 5000, 100, 120000),
    stepTimeoutMs: integer(c.stepTimeoutMs, 'stepTimeoutMs', 15000, 100, 300000),
    settleMs: integer(c.settleMs, 'settleMs', 250, 0, 10000),
    outputDir: resolve(cwd, text(c.outputDir, 'outputDir', 'geochaos-reports')),
    screenshots: screenshots as NormalizedConfig['screenshots'],
    screenshotMasks: strings(c.screenshotMasks, 'screenshotMasks'),
    diagnostics: boolean(c.diagnostics, 'diagnostics', false),
    redact: strings(c.redact, 'redact'),
    browser: {
      headless: boolean(browser.headless, 'browser.headless', true),
      ...(executable ? {executablePath: resolve(cwd, text(executable, 'browser.executablePath'))} : {}),
      viewport: {width: integer(viewport.width, 'viewport.width', 1280, 320, 3840),
        height: integer(viewport.height, 'viewport.height', 850, 240, 2160)}
    },
    geo: {
      mode, allowKeyless: boolean(geo.allowKeyless, 'geo.allowKeyless', false),
      timeoutMs: integer(geo.timeoutMs, 'geo.timeoutMs', 5000, 100, 30000),
      maxLookups: integer(geo.maxLookups, 'geo.maxLookups', 200, 1, 5000), fixtures
    }
  };
}
