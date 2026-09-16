#!/usr/bin/env node
import { VERSION } from './version.js';
import { parseArgs } from 'node:util';
import { writeFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { normalizeConfig } from './config.js';
import { runGeoChaos } from './runner.js';
import { runDemo } from './demo.js';
import { IP2LocationClient } from './geo.js';
import { createRedactor } from './privacy.js';
import type { GeoChaosConfig, GroupBy } from './types.js';

const HELP=`GeoChaos ${VERSION} - IP2Location-powered dependency failure testing

Usage:
  geochaos demo [--output DIR]           Run fragile and resilient local storefronts
  geochaos init [--config FILE]          Create a starter .mjs configuration
  geochaos run [options]                Baseline -> classify -> inject -> report
  geochaos lookup IP [--keyless]        Verify a live IP2Location lookup
  geochaos doctor                      Check browser launch and key availability

Run options:
  --config FILE          .mjs config (default: geochaos.config.mjs)
  --output DIR           Parent directory for unique run artifacts
  --group-by LIST        country,asn (default: both)
  --country LIST         Two-letter codes, e.g. DE,NL; selects country only
  --asn LIST             AS numbers, e.g. 64501; selects ASN only
  --max-scenarios N      Limit selected scenarios (default: 12)
  --baseline-runs N      Baseline attempts per journey (default: 2)
  --scenario-runs N      Attempts per relevant journey/scenario (default: 1)
  --inline               Demo only: mount bundled HTML; skip document navigation
  --headed               Show the browser
  --keyless              Explicitly allow keyless live API calls
  --no-screenshots       Do not capture page screenshots
  --help                 Show this help
  --version              Show version

Environment:
  IP2LOCATION_API_KEY        Used only for live lookups; never written to reports
  GEOCHAOS_CHROMIUM_PATH     Optional Chromium executable override

Exit codes: 0 = tested scope passed, 1 = observed regression,
            2 = invalid, incomplete or inconclusive experiment.
The demo returns 0 only when both expected before/after outcomes are verified.
Use only authorized test/staging systems. Journeys can cause real app actions.
`;
const TEMPLATE=`import { defineConfig, assert } from 'geochaos';

export default defineConfig({
  name: 'My application / dependency resilience',
  baseURL: process.env.TARGET_URL ?? 'http://localhost:3000',
  outputDir: './geochaos-reports',
  // Exact owned origins are protected, not suffix/domain matches.
  firstPartyOrigins: [],
  excludeOrigins: [],
  groupBy: ['country', 'asn'],
  baselineRuns: 2,
  scenarioRuns: 1,
  maxScenarios: 12,
  geo: { mode: 'live', allowKeyless: false, maxLookups: 200 },
  screenshots: 'all',
  screenshotMasks: ['input[type="password"]'],
  diagnostics: false,
  journeys: [{
    name: 'Open application',
    steps: [{
      name: 'Load the page',
      run: async ({ page, baseURL }) => {
        const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
        assert(response?.ok(), 'Application should return a successful response.');
        await page.locator('body').waitFor();
        // Replace this smoke assertion with a meaningful business outcome.
        assert((await page.title()).trim().length > 0, 'Page title should not be empty.');
      },
    }],
  }],
});
`;
function number(value:string|undefined):number|undefined {return value === undefined ? undefined : Number(value);}
function list(value:string|undefined):string[]|undefined {
  if (value === undefined) return undefined;
  const items=value.split(',').map(v=>v.trim());
  if (items.some(v=>!v)) throw new Error('Comma-separated filters must not contain empty values.');
  return items;
}
async function main():Promise<number> {
  const parsed=parseArgs({allowPositionals:true,strict:true,options:{
    help:{type:'boolean',short:'h'},version:{type:'boolean',short:'v'},
    config:{type:'string',short:'c'},output:{type:'string',short:'o'},
    'group-by':{type:'string'},country:{type:'string'},asn:{type:'string'},
    'max-scenarios':{type:'string'},'baseline-runs':{type:'string'},'scenario-runs':{type:'string'},
    inline:{type:'boolean'},headed:{type:'boolean'},keyless:{type:'boolean'},'no-screenshots':{type:'boolean'}
  }});
  const {values:v,positionals}=parsed;
  const command=positionals[0];
  if(v.version){console.log(VERSION);return 0;}
  if(v.help||!command){console.log(HELP);return 0;}
  const commandFlags:Record<string,string[]>={demo:['output','inline'],init:['config'],doctor:[],lookup:['keyless'],run:['config','output','group-by','country','asn','max-scenarios','baseline-runs','scenario-runs','headed','keyless','no-screenshots']};
  if (commandFlags[command]) for (const key of Object.keys(v))
    if (!commandFlags[command]!.includes(key)) throw new Error(`--${key} is not supported by ${command}.`);
  const onProgress=(message:string):void=>console.log(message);
  const controller=new AbortController();
  const interrupt=():void=>{controller.abort();console.error('Cancelling; finishing the partial report where possible.');};
  process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
  try {
    if(command==='init'){
      if(positionals.length>1)throw new Error('init does not accept positional arguments.');
      const file=resolve(v.config??'geochaos.config.mjs');
      if(!file.endsWith('.mjs'))throw new Error('The starter config must use a .mjs extension.');
      await writeFile(file,TEMPLATE,{flag:'wx',mode:0o600});console.log(`Created ${file}`);return 0;
    }
    if(command==='demo'){
      if(positionals.length>1)throw new Error('demo does not accept positional arguments.');
      const demo=await runDemo(v.output??'geochaos-reports/demo',{signal:controller.signal,onProgress,inline:!!v.inline});
      console.log(`\nDemo comparison: ${demo.indexPath}`);
      console.log(`Fragile report:  ${demo.fragile.htmlPath}`);
      console.log(`Fixed report:    ${demo.resilient.htmlPath}`);
      const expected=demo.fragile.report.summary.regressions===2&&demo.fragile.report.summary.completeCoverage&&
        demo.resilient.report.summary.outcome==='passed';
      console.log(expected?'Demo verified: expected failures found, and the fix passes.':'Demo did not match all expected outcomes.');
      return expected?0:2;
    }
    if(command==='doctor'){
      if(positionals.length>1)throw new Error('doctor does not accept positional arguments.');
      console.log(`Node ${process.version}`);
      console.log(`IP2LOCATION_API_KEY: ${process.env.IP2LOCATION_API_KEY?'set (not displayed)':'not set; use demo or explicit --keyless'}`);
      const executablePath=process.env.GEOCHAOS_CHROMIUM_PATH;
      if(executablePath)await access(executablePath);
      const browser=await chromium.launch({headless:true,executablePath,timeout:15000});
      try{console.log(`Chromium ${browser.version()} launches successfully.`);}finally{await browser.close();}
      console.log('Live API connectivity has not been tested. Use: geochaos lookup 8.8.8.8');return 0;
    }
    if(command==='lookup'){
      if(positionals.length!==2)throw new Error('Usage: geochaos lookup IP [--keyless]');
      const client=new IP2LocationClient({apiKey:process.env.IP2LOCATION_API_KEY,allowKeyless:!!v.keyless,signal:controller.signal});
      const result=await client.lookup(positionals[1]!);
      console.log(JSON.stringify(result,null,2));
      console.log('IP Geolocation by IP2Location.io');return result.status==='ok'?0:2;
    }
    if(v.inline)throw new Error('--inline is supported only by the bundled demo.');
    if(command!=='run')throw new Error(`Unknown command "${command}". Use --help.`);
    if(positionals.length>1)throw new Error('run does not accept positional arguments. Use --config FILE.');
    const configPath=resolve(v.config??'geochaos.config.mjs');
    let raw:unknown;
    if(configPath.endsWith('.mjs')) raw=(await import(pathToFileURL(configPath).href)).default;
    else throw new Error('Config files must use .mjs. TypeScript configs must be compiled first.');
    // Normalize relative filesystem settings against the config location, not the invocation directory.
    const original=normalizeConfig(raw,dirname(configPath));
    let groupBy=list(v['group-by']) as GroupBy[]|undefined;
    if(!groupBy&&(v.country!==undefined||v.asn!==undefined))groupBy=[...(v.country!==undefined?['country' as const]:[]),...(v.asn!==undefined?['asn' as const]:[])];
    const config:GeoChaosConfig={...original,
      ...(v.output?{outputDir:resolve(v.output)}:{}),
      ...(groupBy?{groupBy,countries:groupBy.includes('country')?original.countries:[],asns:groupBy.includes('asn')?original.asns:[]}:{}),
      ...(v.country!==undefined?{countries:list(v.country)}:{}),...(v.asn!==undefined?{asns:list(v.asn)}:{}),
      ...(v['max-scenarios']!==undefined?{maxScenarios:number(v['max-scenarios'])}:{}),
      ...(v['baseline-runs']!==undefined?{baselineRuns:number(v['baseline-runs'])}:{}),
      ...(v['scenario-runs']!==undefined?{scenarioRuns:number(v['scenario-runs'])}:{}),
      ...(v['no-screenshots']?{screenshots:'off' as const}:{}),
      browser:{...original.browser,...(v.headed?{headless:false}:{})},
      geo:{...original.geo,...(v.keyless?{allowKeyless:true}:{})}
    };
    // Normalized live configuration carries an empty internal fixture map; omit it at the public boundary.
    if(config.geo?.mode==='live')delete config.geo.fixtures;
    console.log(`GeoChaos / ${config.geo?.mode==='synthetic'?'SYNTHETIC labels':'live IP2Location lookups'}`);
    console.log('Only the test browser is faulted. Journey actions still reach the target application.');
    const output=await runGeoChaos(config,{signal:controller.signal,onProgress});
    console.log(`\nHTML: ${output.htmlPath}\nJSON: ${output.jsonPath}`);
    return output.report.summary.exitCode;
  } finally {process.off('SIGINT',interrupt);process.off('SIGTERM',interrupt);}
}
const redact=createRedactor(process.env.IP2LOCATION_API_KEY?[process.env.IP2LOCATION_API_KEY]:[]);
main().then(code=>{process.exitCode=code;}).catch(error=>{
  console.error(`GeoChaos: ${redact(error)}`);
  console.error('Use --help for usage. If Chromium is missing, run npm run browser:install.');
  process.exitCode=2;
});
