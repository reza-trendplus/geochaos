import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { chromium } from 'playwright-core';
import { startDemoServers, demoConfig } from '../../dist/demo.js';
import { runGeoChaos } from '../../dist/runner.js';

const inline=process.env.GEOCHAOS_INLINE_TESTS==='1';
let servers,root,fragile,resilient;
const cli=(args,cwd=process.cwd())=>new Promise(resolveResult=>execFile(process.execPath,[resolve('dist/cli.js'),...args],
  {cwd,env:process.env,timeout:30000,maxBuffer:2_000_000},(error,stdout,stderr)=>resolveResult({code:error?.code??0,stdout,stderr})));
const quick=(variant='resilient')=>({...demoConfig(servers,variant,root,inline),baselineRuns:1,screenshots:'off',settleMs:20});

before(async()=>{
  root=await mkdtemp(join(tmpdir(),'geochaos-e2e-'));
  servers=await startDemoServers();
  fragile=await runGeoChaos(demoConfig(servers,'fragile',join(root,'fragile'),inline));
  resilient=await runGeoChaos(demoConfig(servers,'resilient',join(root,'resilient'),inline));
});
after(async()=>{await servers?.close();if(root)await rm(root,{recursive:true,force:true});});

test('Fragile app passes every baseline and fails exactly the recommendation country/ASN scenarios',()=>{
  assert.equal(fragile.report.baseline.length,4);
  assert(fragile.report.baseline.every(r=>r.status==='passed'));
  assert.equal(fragile.report.summary.exitCode,1);assert.equal(fragile.report.summary.regressions,2);
  assert.deepEqual(fragile.report.matrix.filter(c=>c.status==='failed').map(c=>[c.journey,c.scenarioId]),[
    ['Complete checkout','country-DE'],['Complete checkout','asn-64501']]);
  assert(fragile.report.results.filter(r=>r.status==='failed').every(r=>r.blockedRequests>0));
  assert.equal(fragile.report.summary.completeCoverage,true);
});
test('The fixed application passes all eight journey/scenario pairs with real requests aborted',()=>{
  assert.equal(resilient.report.summary.exitCode,0);assert.equal(resilient.report.summary.regressions,0);
  assert.equal(resilient.report.matrix.length,8);assert(resilient.report.matrix.every(c=>c.status==='passed'));
  assert(resilient.report.results.every(r=>r.blockedRequests===1));
});
test('Browser response IPs are real loopback addresses, not substituted geographic fixtures',()=>{
  for(const report of [fragile.report,resilient.report]){
    assert.equal(report.mode,'synthetic');
    for(const dependency of report.dependencies.filter(d=>!d.excluded)){
      assert.deepEqual(dependency.ips,['127.0.0.1']);assert.equal(dependency.geo[0].source,'synthetic');
    }
  }
});
test('Aborted requests do not reach the actual dependency servers',()=>{
  // Per app: four baseline requests + four non-blocked scenario requests per dependency.
  assert.equal(servers.counts.recommendations,16);assert.equal(servers.counts.analytics,16);
});
test('All attempts produce PNG evidence and valid machine-readable reports',async()=>{
  for(const result of [fragile,resilient]){
    const parsed=JSON.parse(await readFile(result.jsonPath,'utf8'));assert.deepEqual(parsed.summary,result.report.summary);
    for(const run of [...result.report.baseline,...result.report.results]){
      assert(run.screenshot);const png=await readFile(join(result.reportDir,run.screenshot));
      assert.equal(png.subarray(1,4).toString(),'PNG');assert(png.length>1000);
    }
    const html=await readFile(result.htmlPath,'utf8');assert(html.includes('data:image/png;base64,'));
    assert(html.includes('Synthetic labels. Real browser failures.'));
    if(inline)assert(html.includes('Top-level navigation was not tested.'));
  }
});
test('Report controls work offline and layout does not overflow on desktop or mobile',async()=>{
  const browser=await chromium.launch({executablePath:process.env.GEOCHAOS_CHROMIUM_PATH});
  try{
    const page=await browser.newPage({viewport:{width:1360,height:950}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const requests=[];page.on('request',r=>{if(r.url().startsWith('http'))requests.push(r.url());});
    await page.setContent(await readFile(fragile.htmlPath,'utf8'),{waitUntil:'load'});
    await page.getByRole('button',{name:'Regressions',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'Regressions',exact:true}).getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('[data-matrix-status]:visible').count(),2);
    await page.getByRole('button',{name:'All scenarios',exact:true}).click();
    assert.equal(await page.locator('[data-matrix-status]:visible').count(),4);
    await page.getByRole('searchbox').fill('not-an-observed-origin');
    assert.equal(await page.locator('[data-dependency]:visible').count(),0);
    await page.getByRole('searchbox').fill('');
    for(const width of [1360,390]){
      await page.setViewportSize({width,height:950});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,`width ${width}`);
    }
    assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  }finally{await browser.close();}
});
test('A failing baseline stops every scenario, skips later steps and returns inconclusive',async()=>{
  const config=quick();let laterStepRan=false;
  config.journeys=[{name:'Invalid baseline',steps:[{name:'Fail baseline',run:()=>assert.fail('Baseline intentionally failed')},
    {name:'Never execute',run:()=>{laterStepRan=true;}}]}];
  const result=await runGeoChaos(config);assert.equal(result.report.summary.exitCode,2);
  assert.equal(result.report.results.length,0);assert.equal(result.report.scenarios.length,0);
  assert.equal(result.report.baseline[0].steps[1].status,'skipped');assert.equal(laterStepRan,false);
});
test('A hanging step is bounded by its deadline and returns an inspectable baseline failure',async()=>{
  const config={...quick(),stepTimeoutMs:100,journeys:[{name:'Deadline',steps:[{name:'Hang',run:()=>new Promise(()=>{})}]}]};
  const result=await runGeoChaos(config);assert.equal(result.report.summary.exitCode,2);
  assert.match(result.report.baseline[0].steps[0].error,/deadline/);assert(result.report.durationMs<5000);
});
test('Live mode skips private IPs and does not claim complete coverage',async()=>{
  const config={...quick(),geo:{mode:'live',allowKeyless:true}};
  const result=await runGeoChaos(config);assert.equal(result.report.summary.exitCode,2);
  assert.equal(result.report.scenarios.length,0);
  assert(result.report.dependencies.filter(d=>!d.excluded).every(d=>d.geo.every(g=>g.status==='non-public')));
});
test('A scenario cap leaves an otherwise passing run explicitly incomplete',async()=>{
  const result=await runGeoChaos({...quick(),maxScenarios:1});
  assert.equal(result.report.scenarios.length,1);assert.equal(result.report.summary.exitCode,2);
  assert.equal(result.report.summary.completeCoverage,false);assert(result.report.warnings.some(w=>w.includes('Scenario limit')));
});
test('Each attempt uses a fresh context without inheriting cookies',async()=>{
  const config={...quick(),groupBy:['country'],countries:['NL'],baselineRuns:2};
  const journey=config.journeys[1];let attempts=0;
  config.journeys=[{...journey,steps:[{name:'Fresh browser context',run:async({page})=>{
    attempts++;assert.equal((await page.context().cookies()).length,0);
    await page.context().addCookies([{name:'geochaos-test',value:'not-secret',url:servers.appOrigin}]);
  }},...journey.steps]}];
  const result=await runGeoChaos(config);assert.equal(result.report.summary.exitCode,0);assert.equal(attempts,3);
});
test('A target that disappears in a scenario cannot be mislabeled as a passing failure test',async()=>{
  const config={...quick(),groupBy:['country'],countries:['DE']};let calls=0;
  const step=config.journeys[1].steps[0];
  config.journeys=[{name:'Changing traffic',steps:[{name:'Conditionally load application',run:async context=>{
    if(calls++===0)await step.run(context);else await context.page.setContent('<h1>No dependencies requested</h1>');
  }}]}];
  const result=await runGeoChaos(config);assert.equal(result.report.summary.exitCode,2);
  assert.equal(result.report.results[0].status,'inconclusive');assert.equal(result.report.results[0].blockedRequests,0);
});
test('Cancellation writes a partial report instead of reporting success',async()=>{
  const controller=new AbortController();
  const config={...quick(),journeys:[{name:'Cancelled journey',steps:[{name:'Wait for cancellation',run:async()=>{
    setTimeout(()=>controller.abort(),20);await new Promise(()=>{});
  }}]}]};
  const result=await runGeoChaos(config,{signal:controller.signal});assert.equal(result.report.summary.exitCode,2);
  assert(result.report.warnings.some(w=>w.includes('cancelled')));
});
test('Screenshot opt-out and diagnostics opt-out are honored',async()=>{
  const config={...quick(),diagnostics:false,groupBy:['country'],countries:['NL']};
  const result=await runGeoChaos(config);assert.equal(result.report.summary.exitCode,0);
  assert.deepEqual(await readdir(join(result.reportDir,'screenshots')),[]);
  assert([...result.report.baseline,...result.report.results].every(r=>r.screenshot===null&&r.diagnostics.length===0));
});
test('CLI starter creation is non-destructive; flags and invalid commands fail explicitly',async()=>{
  assert.equal((await cli(['--version'])).stdout.trim(),'0.1.1');
  const path=join(root,'starter.mjs');assert.equal((await cli(['init','--config',path])).code,0);
  const first=await readFile(path,'utf8');assert.equal((await cli(['init','--config',path])).code,2);
  assert.equal(await readFile(path,'utf8'),first);
  assert.equal((await cli(['nonexistent'])).code,2);
  assert.equal((await cli(['demo','--country','DE'])).code,2);
});
test('CLI runs a filtered scenario, resolves config-relative output paths and returns zero',async()=>{
  const file=join(root,'cli.config.mjs');
  const data={appOrigin:servers.appOrigin,recommendationOrigin:servers.recommendationOrigin,analyticsOrigin:servers.analyticsOrigin};
  await writeFile(file,`import { demoConfig } from ${JSON.stringify(pathToFileURL(resolve('dist/demo.js')).href)};\nexport default demoConfig(${JSON.stringify(data)},'resilient','cli-relative-output',${inline});\n`);
  const result=await cli(['run','--config',file,'--country','NL','--baseline-runs','1','--no-screenshots']);
  assert.equal(result.code,0,result.stderr+'\n'+result.stdout);
  const dirs=await readdir(join(root,'cli-relative-output'));assert.equal(dirs.length,1);
  const report=JSON.parse(await readFile(join(root,'cli-relative-output',dirs[0],'report.json'),'utf8'));
  assert.deepEqual(report.scenarios.map(s=>s.id),['country-NL']);assert.equal(report.summary.exitCode,0);
});

test('Partially bypassed target interception is inconclusive even when another target request was aborted',async()=>{
  const config={...quick(),groupBy:['country'],countries:['DE']};
  const journey=config.journeys[1];
  config.journeys=[{...journey,steps:[{name:'Install an intentionally interfering page route',run:async({page})=>{
    await page.route(`${servers.recommendationOrigin}/passthrough`,route=>route.fulfill({status:200,body:'{}',contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'}}));
  }},...journey.steps,{name:'Request bypassed endpoint',run:async({page})=>{
    await page.evaluate(async url=>{await fetch(url);},`${servers.recommendationOrigin}/passthrough`);
  }}]}];
  const result=await runGeoChaos(config);assert.equal(result.report.summary.exitCode,2);
  assert.equal(result.report.results[0].status,'inconclusive');assert(result.report.results[0].blockedRequests>0);
  assert.match(result.report.results[0].reason,/not aborted/);
});
