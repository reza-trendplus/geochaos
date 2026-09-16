import { randomUUID } from 'node:crypto';
import { mkdir, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { chromium, type Browser, type BrowserContext, type Page, type Response } from 'playwright-core';
import { normalizeConfig } from './config.js';
import { IP2LocationClient } from './geo.js';
import { httpOrigin, normalizeIP } from './ip.js';
import { createRedactor } from './privacy.js';
import { buildDependencies, buildScenarios } from './scenarios.js';
import { buildMatrix, summarize } from './summary.js';
import { writeReport } from './report.js';
import type { GeoChaosConfig, GeoChaosReport, Journey, JourneyResult, NormalizedConfig,
  OriginObservation, RunOptions, RunOutput, Scenario, StepResult } from './types.js';

import { VERSION } from './version.js';
const ORIGIN_LIMIT = 500;
function errorMessage(error:unknown):string {return error instanceof Error ? error.message : String(error);}

/** Promise deadline. Synchronous, non-yielding user code cannot be preempted. */
export async function withDeadline<T>(operation:(signal:AbortSignal)=>Promise<T>, ms:number,
  external?:AbortSignal):Promise<T> {
  const controller = new AbortController();
  let timer:ReturnType<typeof setTimeout> | undefined;
  let abortListener:(()=>void) | undefined;
  const deadline = new Promise<never>((_,reject) => {
    const cancel = (message:string) => {controller.abort(); reject(new Error(message));};
    timer = setTimeout(() => cancel(`Step exceeded its ${ms} ms deadline.`),ms);
    abortListener = () => cancel('Run cancelled.');
    if (external?.aborted) abortListener();
    else external?.addEventListener('abort',abortListener,{once:true});
  });
  try {
    return await Promise.race([Promise.resolve().then(() => {
      if (controller.signal.aborted) throw new Error('Run cancelled.');
      return operation(controller.signal);
    }),deadline]);
  } finally {
    if (timer) clearTimeout(timer);
    if (abortListener) external?.removeEventListener('abort',abortListener);
  }
}
interface ObservationState {
  byOrigin:Map<string,OriginObservation>;
  pending:Set<Promise<unknown>>;
  overflow:boolean;
  interceptErrors:number;
  warnings:Set<string>;
  diagnostics:string[];
  finishing:boolean;
}
function collect(context:BrowserContext, targets:Set<string>, config:NormalizedConfig,
  redact:(value:unknown)=>string):ObservationState {
  const state:ObservationState = {byOrigin:new Map(),pending:new Set(),overflow:false,
    interceptErrors:0,warnings:new Set(),diagnostics:[],finishing:false};
  function observation(url:string):OriginObservation | null {
    const origin = httpOrigin(url);
    if (!origin) return null;
    let value = state.byOrigin.get(origin);
    if (!value && !state.finishing) {
      if (state.byOrigin.size >= ORIGIN_LIMIT) {state.overflow = true; return null;}
      value = {origin,ips:[],requests:0,responses:0,failedRequests:0,blockedRequests:0,
        resourceTypes:[],httpErrors:[],addressMisses:0};
      state.byOrigin.set(origin,value);
    }
    return value ?? null;
  }
  context.on('request', request => {
    if (state.finishing) return;
    const o = observation(request.url()); if (!o) return;
    o.requests++;
    const kind = request.resourceType(); if (!o.resourceTypes.includes(kind)) o.resourceTypes.push(kind);
  });
  context.on('requestfailed',request => {
    if (state.finishing) return;
    const o = observation(request.url()); if (o) o.failedRequests++;
  });
  context.on('response',(response:Response) => {
    if (state.finishing) return;
    const o = observation(response.url()); if (!o) return;
    o.responses++;
    if (response.status() >= 400 && !o.httpErrors.includes(response.status())) o.httpErrors.push(response.status());
    const task = (async () => {
      try {
        const address = await response.serverAddr();
        const ip = address?.ipAddress ? normalizeIP(address.ipAddress) : null;
        if (ip) {if (!o.ips.includes(ip)) o.ips.push(ip);} else o.addressMisses++;
      } catch {o.addressMisses++;}
    })();
    state.pending.add(task);
    void task.finally(() => state.pending.delete(task));
  });
  const watchPage = (page:Page):void => {
    page.on('websocket',() => {if (!state.finishing) state.warnings.add('WebSocket traffic was observed and is not intercepted by this HTTP(S)-only version.');});
    page.on('crash',() => state.warnings.add('A browser page crashed; the experiment may be unreliable.'));
    if (!config.diagnostics) return;
    page.on('pageerror',error => {
      if (!state.finishing && state.diagnostics.length < 30) state.diagnostics.push(`Page error: ${redact(error)}`);
    });
    page.on('console',message => {
      if (!state.finishing && ['error','warning'].includes(message.type()) && state.diagnostics.length < 30)
        state.diagnostics.push(`${message.type()}: ${redact(message.text())}`);
    });
  };
  context.on('page',watchPage);
  for (const page of context.pages()) watchPage(page);
  const routeSetup = context.route('**/*',async route => {
    const origin = httpOrigin(route.request().url());
    const shouldBlock = origin !== null && targets.has(origin);
    try {
      if (shouldBlock) {
        await route.abort('failed');
        const o = observation(route.request().url()); if (o) o.blockedRequests++;
      } else await route.continue();
    } catch {
      if (!state.finishing) state.interceptErrors++;
    }
  });
  state.pending.add(routeSetup);
  void routeSetup.finally(() => state.pending.delete(routeSetup)).catch(() => {});
  return state;
}
async function executeJourney(browser:Browser, config:NormalizedConfig, journey:Journey,
  scenario:Scenario | null, attempt:number, reportDir:string, options:RunOptions,
  redact:(value:unknown)=>string):Promise<JourneyResult> {
  const id = `${scenario?.id ?? 'baseline'}-${randomUUID().slice(0,8)}`;
  const start = performance.now();
  const context = await browser.newContext({serviceWorkers:'block', viewport:config.browser.viewport,
    locale:'en-US',timezoneId:'UTC',deviceScaleFactor:1,acceptDownloads:false});
  const state = collect(context,new Set(scenario?.origins ?? []),config,redact);
  const steps:StepResult[] = [];
  let screenshot:string | null = null;
  let failed = false;
  let infrastructureError:string | undefined;
  let page:Page | undefined;
  try {
    await Promise.all([...state.pending]);
    context.setDefaultTimeout(config.actionTimeoutMs);
    context.setDefaultNavigationTimeout(config.stepTimeoutMs);
    page = await context.newPage();
    for (const step of journey.steps) {
      if (failed || options.signal?.aborted) {
        steps.push({name:step.name,status:'skipped',durationMs:0});
        continue;
      }
      const stepStart = performance.now();
      try {
        await withDeadline(async signal => {
          await step.run({page:page!,baseURL:config.baseURL,signal});
        },config.stepTimeoutMs,options.signal);
        steps.push({name:step.name,status:'passed',durationMs:Math.round(performance.now()-stepStart)});
      } catch (error) {
        failed = true;
        steps.push({name:step.name,status:'failed',durationMs:Math.round(performance.now()-stepStart),error:redact(error)});
      }
    }
    if (config.settleMs && !options.signal?.aborted)
      await new Promise(resolve => setTimeout(resolve,config.settleMs));
    if (config.screenshots === 'all' || (config.screenshots === 'failures' && failed)) {
      if (!page.isClosed()) {
        try {
          screenshot = `screenshots/${id}.png`;
          await page.screenshot({path:join(reportDir,screenshot),fullPage:false,timeout:5000,
            animations:'disabled',mask:config.screenshotMasks.map(selector => page!.locator(selector))});
          await chmod(join(reportDir,screenshot),0o600).catch(() => {});
        } catch {screenshot = null; state.warnings.add('A screenshot could not be captured.');}
      }
    }
  } catch (error) {infrastructureError = redact(error);}
  finally {
    state.finishing = true;
    // Closing the context releases outstanding address observations and requests.
    await context.close().catch(() => {});
    await Promise.race([Promise.allSettled([...state.pending]),new Promise(resolve => {
      const timer = setTimeout(resolve,1000); timer.unref();
    })]);
  }
  const origins = [...state.byOrigin.values()].sort((a,b) => a.origin.localeCompare(b.origin));
  const blockedRequests = origins.reduce((n,o) => n+o.blockedRequests,0);
  const uncoveredTargets = scenario ? origins.filter(o => scenario.origins.includes(o.origin) &&
    (o.responses > 0 || o.requests > o.blockedRequests)) : [];
  const warnings = [...state.warnings];
  let status:JourneyResult['status'] = failed ? 'failed' : 'passed';
  let reason:string | undefined;
  if (infrastructureError) {status = 'inconclusive';reason = `Browser instrumentation error: ${infrastructureError}`;}
  else if (options.signal?.aborted) {status = 'inconclusive';reason = 'Run cancelled.';}
  else if (state.overflow || state.interceptErrors || steps.length !== journey.steps.length || warnings.some(w => w.includes('crashed'))) {
    status = 'inconclusive'; reason = 'Incomplete browser instrumentation; cannot trust this experiment.';
  } else if (state.pending.size > 0) {
    status = 'inconclusive'; reason = 'Some server-address observations did not finish; capture is incomplete.';
  } else if (scenario && !blockedRequests) {
    status = 'inconclusive'; reason = 'No targeted request was actually aborted in this attempt.';
  } else if (uncoveredTargets.length) {
    status = 'inconclusive'; reason = 'Some requests to a frozen target were not aborted. Redirect follow-ups or journey-level routing can bypass interception.';
  }
  if (state.overflow) warnings.push(`Origin capture limit of ${ORIGIN_LIMIT} exceeded.`);
  if (state.interceptErrors) warnings.push(`${state.interceptErrors} request interception operation(s) failed.`);
  return {id,journey:journey.name,phase:scenario ? 'scenario' : 'baseline',scenarioId:scenario?.id ?? null,
    attempt,status,...(reason ? {reason} : {}),durationMs:Math.round(performance.now()-start),
    steps,origins,blockedRequests,diagnostics:[...new Set(state.diagnostics)],warnings,screenshot};
}
export async function runGeoChaos(input:GeoChaosConfig, options:RunOptions = {}):Promise<RunOutput> {
  const config = normalizeConfig(input);
  const apiKey = process.env.IP2LOCATION_API_KEY?.trim();
  const redact = createRedactor([...config.redact,...(apiKey ? [apiKey] : [])]);
  const progress = (message:string):void => {options.onProgress?.(redact(message));};
  const client = config.geo.mode === 'live' ? new IP2LocationClient({apiKey,
    allowKeyless:config.geo.allowKeyless,timeoutMs:config.geo.timeoutMs,
    maxLookups:config.geo.maxLookups,signal:options.signal}) : null;
  const startedAt = new Date().toISOString(), start = performance.now();
  const runId = `${startedAt.replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}`;
  const reportDir = join(config.outputDir,runId);
  await mkdir(join(reportDir,'screenshots'),{recursive:true,mode:0o700});
  await chmod(reportDir,0o700).catch(() => {});
  let browser:Browser;
  try {
    browser = await chromium.launch({headless:config.browser.headless,
      executablePath:config.browser.executablePath,timeout:20000});
  } catch {
    throw new Error('Chromium could not start. Run npm run browser:install, or set GEOCHAOS_CHROMIUM_PATH to a compatible browser executable.');
  }
  const browserVersion = browser.version();
  const baseline:JourneyResult[] = [], results:JourneyResult[] = [];
  let dependencies:GeoChaosReport['dependencies'] = [], scenarios:Scenario[] = [];
  const warnings:string[] = config.notes.map(redact);
  let completeCoverage = true;
  if (config.geo.mode === 'synthetic') warnings.push('SYNTHETIC DEMO: country and ASN labels are assigned fixtures, not live geolocation. Observed browser IPs remain unchanged.');
  try {
    for (let attempt=1;attempt<=config.baselineRuns;attempt++) for (const journey of config.journeys) {
      if (options.signal?.aborted) break;
      progress(`Baseline ${attempt}/${config.baselineRuns}: ${journey.name}`);
      const result = await executeJourney(browser,config,journey,null,attempt,reportDir,options,redact);
      baseline.push(result); warnings.push(...result.warnings);
      progress(`  ${result.status.toUpperCase()}: ${journey.name}`);
    }
    const baselinePassed = baseline.length === config.journeys.length*config.baselineRuns && baseline.every(r => r.status === 'passed');
    if (!baselinePassed) {
      completeCoverage = false;
      warnings.push('Baseline gate failed or was interrupted. No failure scenarios were executed. Repair or stabilize the baseline first.');
      // Do not spend API quota enriching a failed experiment.
      dependencies = await buildDependencies(baseline,{...config,geo:{...config.geo,mode:'live',fixtures:{}}},null);
    } else {
      progress(config.geo.mode === 'live' ? 'Classifying observed public IPs with IP2Location.io...' : 'Applying explicitly synthetic origin labels...');
      dependencies = await buildDependencies(baseline,config,client);
      const plan = buildScenarios(dependencies,config);
      scenarios = plan.scenarios; warnings.push(...plan.warnings); completeCoverage = plan.completeCoverage;
      for (const scenario of scenarios) {
        if (options.signal?.aborted) break;
        for (const journey of config.journeys) {
          const relevant = dependencies.some(d => scenario.origins.includes(d.origin) && d.journeys.includes(journey.name));
          if (!relevant) continue;
          for (let attempt=1;attempt<=config.scenarioRuns;attempt++) {
            if (options.signal?.aborted) break;
            progress(`${scenario.id} [${attempt}/${config.scenarioRuns}]: ${journey.name}`);
            const result = await executeJourney(browser,config,journey,scenario,attempt,reportDir,options,redact);
            const newOrigins = result.origins.filter(o => !dependencies.some(d => d.origin === o.origin) &&
              !config.firstPartyOrigins.includes(o.origin) && !config.excludeOrigins.includes(o.origin));
            if (newOrigins.length) {
              completeCoverage = false;
              result.warnings.push(`New origins outside the frozen baseline target set: ${newOrigins.map(o => o.origin).join(', ')}. These were not classified or blocked.`);
            }
            results.push(result);warnings.push(...result.warnings);
            progress(`  ${result.status.toUpperCase()}: ${result.blockedRequests} request(s) aborted`);
          }
        }
      }
    }
  } catch (error) {
    completeCoverage = false;
    warnings.push(`Run stopped unexpectedly: ${redact(errorMessage(error))}`);
  } finally {await browser.close().catch(() => {});}
  if (options.signal?.aborted) {completeCoverage = false;warnings.push('Run was cancelled; unexecuted scenarios are inconclusive.');}
  if ([...baseline,...results].some(r => r.warnings.some(w => w.includes('WebSocket')))) completeCoverage = false;
  const matrix = buildMatrix(config.journeys.map(j => j.name),scenarios,results,dependencies);
  const summary = summarize(baseline,matrix,dependencies,completeCoverage,
    config.journeys.length*config.baselineRuns,config.scenarioRuns);
  const report:GeoChaosReport = {
    schemaVersion:1,version:VERSION,runId,name:redact(config.name),mode:config.geo.mode,
    appOrigin:new URL(config.baseURL).origin,startedAt,finishedAt:new Date().toISOString(),
    durationMs:Math.round(performance.now()-start),environment:{node:process.version,browser:browserVersion},
    settings:{groupBy:config.groupBy,baselineRuns:config.baselineRuns,scenarioRuns:config.scenarioRuns,
      serviceWorkers:'blocked',httpCache:'disabled',diagnostics:config.diagnostics,
      protectedOrigins:config.firstPartyOrigins,excludedOrigins:config.excludeOrigins},
    warnings:[...new Set(warnings)],baseline,dependencies,scenarios,results,matrix,summary
  };
  const paths = await writeReport(report,reportDir);
  progress(`Report written. Outcome: ${summary.outcome}; exit code ${summary.exitCode}.`);
  return {report,reportDir,...paths};
}
