import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../../dist/config.js';
import { buildScenarios, buildDependencies, classify } from '../../dist/scenarios.js';
import { buildMatrix, summarize } from '../../dist/summary.js';
const config=extra=>normalizeConfig({baseURL:'https://app.test',journeys:[{name:'Shop',steps:[{name:'Open',run:async()=>{}}]}],...extra});
const known=value=>({state:'known',values:[value]});
const dep=(origin,country='DE',asn='64501',extra={})=>({origin,ips:['8.8.8.8'],requests:1,responses:1,failedRequests:0,blockedRequests:0,resourceTypes:['fetch'],httpErrors:[],addressMisses:0,excluded:null,journeys:['Shop'],geo:[],country:known(country),asn:known(asn),...extra});
const run=(id,status='passed',extra={})=>({id,journey:'Shop',phase:'scenario',scenarioId:'country-DE',attempt:1,status,durationMs:1,steps:[],origins:[],blockedRequests:1,diagnostics:[],warnings:[],screenshot:null,...extra});

test('Classification distinguishes known, mixed, partial and unknown',()=>{
  assert.deepEqual(classify(['DE','DE']),known('DE'));assert.equal(classify(['DE','US']).state,'mixed');
  assert.equal(classify(['DE',null]).state,'partial');assert.equal(classify(['DE'],true).state,'partial');
  assert.equal(classify([null]).state,'unknown');assert.equal(classify([]).state,'unknown');
});
test('Scenario targets are deterministic and protect first-party/user-excluded origins',()=>{
  const deps=[dep('https://z.test'),dep('https://a.test'),dep('https://app.test','DE','64501',{excluded:'first-party'}),dep('https://ignored.test','DE','64501',{excluded:'user-excluded'})];
  const plan=buildScenarios(deps,config({}));
  assert.equal(plan.scenarios.length,2);assert.deepEqual(plan.scenarios[0].origins,['https://a.test','https://z.test']);
  assert.equal(plan.completeCoverage,true);
});
test('A mixed country does not prevent a consistently known ASN scenario',()=>{
  const plan=buildScenarios([dep('https://cdn.test','DE','64501',{country:classify(['DE','US'])})],config({}));
  assert.deepEqual(plan.scenarios.map(s=>s.id),['asn-64501']);assert.equal(plan.completeCoverage,false);
});
test('Partial labels never enter automatic scenarios for that axis',()=>{
  const plan=buildScenarios([dep('https://cdn.test','DE','64501',{country:classify(['DE',null])})],config({groupBy:['country']}));
  assert.equal(plan.scenarios.length,0);assert.equal(plan.completeCoverage,false);
});
test('Filters choose only requested groups and report unmatched values',()=>{
  const deps=[dep('https://a.test'),dep('https://b.test','NL','64502')];
  const matched=buildScenarios(deps,config({groupBy:['country'],countries:['DE']}));
  assert.deepEqual(matched.scenarios.map(s=>s.id),['country-DE']);assert.equal(matched.completeCoverage,true);
  const missing=buildScenarios(deps,config({groupBy:['country'],countries:['US']}));
  assert.equal(missing.scenarios.length,0);assert.match(missing.warnings.join(' '),/matched country US/);
});
test('Scenario cap is explicit and makes coverage incomplete',()=>{
  const plan=buildScenarios([dep('https://a.test'),dep('https://b.test','NL','64502')],config({maxScenarios:1}));
  assert.equal(plan.scenarios.length,1);assert.equal(plan.completeCoverage,false);assert.match(plan.warnings.join(' '),/1 of 4/);
});
test('No dependencies never yields an all-clear plan',()=>{
  const plan=buildScenarios([],config({}));assert.equal(plan.completeCoverage,false);assert.equal(plan.scenarios.length,0);
});
test('Enrichment deduplicates observed addresses, protects first party, and keeps actual IPs',async()=>{
  const observation=dep('https://cdn.test');let lookups=0;
  const baseline=[run('b1','passed',{journey:'Shop',origins:[observation,dep('https://app.test')]}),run('b2','passed',{journey:'Browse',origins:[observation]})];
  const client={lookup:async ip=>{lookups++;return {ip,countryCode:'DE',countryName:'Germany',asn:'64501',asName:'Test',source:'ip2location',status:'ok'};}};
  const deps=await buildDependencies(baseline,config({}),client);
  assert.equal(lookups,1);const cdn=deps.find(d=>d.origin==='https://cdn.test');
  assert.deepEqual(cdn.journeys,['Shop','Browse']);assert.equal(cdn.requests,2);assert.deepEqual(cdn.ips,['8.8.8.8']);
  assert.equal(deps.find(d=>d.origin==='https://app.test').excluded,'first-party');
});
test('Synthetic enrichment never replaces observed IPs with invented geographic addresses',async()=>{
  const o=dep('http://127.0.0.1:5000','DE','64501',{ips:['127.0.0.1']});
  const cfg=config({geo:{mode:'synthetic',fixtures:{[o.origin]:{countryCode:'DE',countryName:'Fake DE',asn:'64501',asName:'Fake network'}}}});
  const deps=await buildDependencies([run('b','passed',{origins:[o]})],cfg,null);
  assert.deepEqual(deps[0].ips,['127.0.0.1']);assert.equal(deps[0].geo[0].source,'synthetic');assert.equal(deps[0].country.state,'known');
});
test('Repeated contradictory scenario outcomes are inconclusive, not a stable regression',()=>{
  const deps=[dep('https://a.test')],scenarios=buildScenarios(deps,config({groupBy:['country']})).scenarios;
  const matrix=buildMatrix(['Shop'],scenarios,[run('r1','passed'),run('r2','failed')],deps);
  assert.equal(matrix[0].status,'inconclusive');assert.match(matrix[0].reason,/disagreed/);
});
test('Unexecuted relevant scenarios are inconclusive; genuinely unrelated journeys are N/A',()=>{
  const deps=[dep('https://a.test')],scenarios=buildScenarios(deps,config({groupBy:['country']})).scenarios;
  const matrix=buildMatrix(['Shop','Unrelated'],scenarios,[],deps);
  assert.equal(matrix[0].status,'inconclusive');assert.equal(matrix[1].status,'not-applicable');
});
test('Exit codes distinguish regressions, complete passing evidence, and partial evidence',()=>{
  const baseline=[run('b1'),run('b2')],deps=[dep('https://a.test')];
  const cell={journey:'Shop',scenarioId:'country-DE',status:'passed',blockedRequests:1,runIds:['r1']};
  assert.equal(summarize(baseline,[cell],deps,true,2).exitCode,0);
  assert.equal(summarize(baseline,[{...cell,status:'failed'}],deps,true,2).exitCode,1);
  assert.equal(summarize(baseline,[cell],deps,false,2).exitCode,2);
  assert.equal(summarize(baseline,[cell],deps,true,2,2).exitCode,2);
  assert.equal(summarize([run('b','failed')],[{...cell,status:'failed'}],deps,true,1).regressions,0);
  assert.equal(summarize([],[],[],true,0).exitCode,2);
});
