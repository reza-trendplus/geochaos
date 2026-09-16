import type { Page } from 'playwright-core';

export type GroupBy = 'country' | 'asn';
export type Status = 'passed' | 'failed' | 'inconclusive' | 'not-applicable';
export type Mode = 'live' | 'synthetic';
export interface JourneyContext {
  page: Page;
  baseURL: string;
  /** Aborted when a step times out or the overall run is cancelled. */
  signal: AbortSignal;
}
export interface JourneyStep {
  name: string;
  run: (context: JourneyContext) => Promise<void> | void;
}
export interface Journey {
  name: string;
  steps: JourneyStep[];
}
export interface SyntheticLocation {
  countryCode: string;
  countryName: string;
  asn: string;
  asName: string;
}
export interface GeoChaosConfig {
  name?: string;
  /** Extra interpretation notes, displayed prominently in the report. */
  notes?: string[];
  baseURL: string;
  journeys: Journey[];
  /** Exact HTTP(S) origins. The baseURL origin is always protected. */
  firstPartyOrigins?: string[];
  excludeOrigins?: string[];
  groupBy?: GroupBy[];
  countries?: string[];
  asns?: string[];
  maxScenarios?: number;
  baselineRuns?: number;
  scenarioRuns?: number;
  actionTimeoutMs?: number;
  stepTimeoutMs?: number;
  settleMs?: number;
  outputDir?: string;
  screenshots?: 'all' | 'failures' | 'off';
  screenshotMasks?: string[];
  /** Console messages can contain personal information. Off by default. */
  diagnostics?: boolean;
  /** Additional exact secret values to remove from text diagnostics. */
  redact?: string[];
  browser?: {
    executablePath?: string;
    headless?: boolean;
    viewport?: { width: number; height: number };
  };
  geo?: {
    mode?: Mode;
    allowKeyless?: boolean;
    timeoutMs?: number;
    maxLookups?: number;
    /** Explicitly synthetic labels, keyed by exact origin, never by fake IP. */
    fixtures?: Record<string, SyntheticLocation>;
  };
}
export interface NormalizedConfig {
  name: string;
  notes: string[];
  baseURL: string;
  journeys: Journey[];
  firstPartyOrigins: string[];
  excludeOrigins: string[];
  groupBy: GroupBy[];
  countries: string[];
  asns: string[];
  maxScenarios: number;
  baselineRuns: number;
  scenarioRuns: number;
  actionTimeoutMs: number;
  stepTimeoutMs: number;
  settleMs: number;
  outputDir: string;
  screenshots: 'all' | 'failures' | 'off';
  screenshotMasks: string[];
  diagnostics: boolean;
  redact: string[];
  browser: {
    executablePath?: string;
    headless: boolean;
    viewport: { width: number; height: number };
  };
  geo: {
    mode: Mode;
    allowKeyless: boolean;
    timeoutMs: number;
    maxLookups: number;
    fixtures: Record<string, SyntheticLocation>;
  };
}
export interface GeoRecord {
  ip: string;
  countryCode: string | null;
  countryName: string | null;
  asn: string | null;
  asName: string | null;
  source: 'ip2location' | 'synthetic' | 'none';
  status: 'ok' | 'unknown' | 'error' | 'non-public';
  reason?: string;
  lookedUpAt?: string;
}
export interface OriginObservation {
  origin: string;
  ips: string[];
  requests: number;
  responses: number;
  failedRequests: number;
  blockedRequests: number;
  resourceTypes: string[];
  httpErrors: number[];
  addressMisses: number;
}
export interface Classification {
  state: 'known' | 'mixed' | 'partial' | 'unknown' | 'excluded';
  values: string[];
}
export interface Dependency extends OriginObservation {
  excluded: 'first-party' | 'user-excluded' | null;
  journeys: string[];
  geo: GeoRecord[];
  country: Classification;
  asn: Classification;
}
export interface Scenario {
  id: string;
  groupBy: GroupBy;
  value: string;
  name: string;
  origins: string[];
}
export interface StepResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  error?: string;
}
export interface JourneyResult {
  id: string;
  journey: string;
  phase: 'baseline' | 'scenario';
  scenarioId: string | null;
  attempt: number;
  status: Status;
  reason?: string;
  durationMs: number;
  steps: StepResult[];
  origins: OriginObservation[];
  blockedRequests: number;
  diagnostics: string[];
  warnings: string[];
  screenshot: string | null;
}
export interface MatrixCell {
  journey: string;
  scenarioId: string;
  status: Status;
  blockedRequests: number;
  runIds: string[];
  reason?: string;
}
export interface ReportSummary {
  outcome: 'passed' | 'regressions' | 'inconclusive';
  exitCode: 0 | 1 | 2;
  baselinePassed: boolean;
  regressions: number;
  passedCells: number;
  inconclusiveCells: number;
  notApplicableCells: number;
  dependencyCount: number;
  classifiedCount: number;
  completeCoverage: boolean;
}
export interface GeoChaosReport {
  schemaVersion: 1;
  version: string;
  runId: string;
  name: string;
  mode: Mode;
  appOrigin: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  environment: { node: string; browser: string };
  settings: {
    groupBy: GroupBy[];
    baselineRuns: number;
    scenarioRuns: number;
    serviceWorkers: 'blocked';
    httpCache: 'disabled';
    diagnostics: boolean;
    protectedOrigins: string[];
    excludedOrigins: string[];
  };
  warnings: string[];
  baseline: JourneyResult[];
  dependencies: Dependency[];
  scenarios: Scenario[];
  results: JourneyResult[];
  matrix: MatrixCell[];
  summary: ReportSummary;
}
export interface RunOptions {
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}
export interface RunOutput {
  report: GeoChaosReport;
  reportDir: string;
  htmlPath: string;
  jsonPath: string;
}
