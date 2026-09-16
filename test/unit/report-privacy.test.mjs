import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRedactor, escapeHtml } from '../../dist/privacy.js';
import { renderReport } from '../../dist/report.js';
import { withDeadline } from '../../dist/runner.js';

const report=()=>({schemaVersion:1,version:'0.1.0',runId:'unit-test',name:'Test report',mode:'synthetic',appOrigin:'https://app.test',startedAt:'2026-09-16T00:00:00Z',finishedAt:'2026-09-16T00:00:01Z',durationMs:1000,environment:{node:'v22',browser:'144'},settings:{groupBy:['country'],baselineRuns:1,scenarioRuns:1,serviceWorkers:'blocked',httpCache:'disabled',diagnostics:false,protectedOrigins:['https://app.test'],excludedOrigins:[]},warnings:[],baseline:[],dependencies:[],scenarios:[],results:[],matrix:[],summary:{outcome:'inconclusive',exitCode:2,baselinePassed:false,regressions:0,passedCells:0,inconclusiveCells:0,notApplicableCells:0,dependencyCount:0,classifiedCount:0,completeCoverage:false}});
test('Redaction removes exact secrets, bearer tokens, emails and URL paths/queries',()=>{
  const redact=createRedactor(['VERY-PRIVATE']);
  const text=redact('key=VERY-PRIVATE Bearer abcdef user@example.test https://u:p@host.test/private/path?token=x#q');
  for(const secret of ['VERY-PRIVATE','abcdef','user@example.test','/private/path','token=x','u:p@'])assert.equal(text.includes(secret),false,secret);
  assert.match(text,/host\.test/);
});
test('Redaction strips terminal controls and bounds output size',()=>{
  const redact=createRedactor();assert.equal(redact('\x1b[31merror\x1b[0m'),'error');
  assert.equal(redact('a'.repeat(2000)).length,1800);
});
test('HTML escaping includes attribute quotes',()=>{
  assert.equal(escapeHtml('<a "x" & \'y\'>'),'&lt;a &quot;x&quot; &amp; &#39;y&#39;&gt;');
});
test('Report escapes untrusted metadata and includes a restrictive valid script hash',async()=>{
  const r=report();r.name='</title><script>window.PWNED=true</script>';r.warnings=['<img src=x onerror=alert(1)>'];
  const html=await renderReport(r,'/tmp');
  assert.equal(html.includes('<script>window.PWNED'),false);assert.equal(html.includes('<img src=x'),false);
  assert.match(html,/SYNTHETIC DEMO/);assert.match(html,/IP Geolocation by IP2Location.io/);
  const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];assert(script);
  assert(html.includes(createHash('sha256').update(script).digest('base64')));
  assert.match(html,/default-src &#39;none&#39;/);
});
test('Report HTML has no remote asset URLs or insecure raw JSON script payload',async()=>{
  const html=await renderReport(report(),'/tmp');
  assert.equal(/<(?:script|img|link)[^>]+(?:src|href)="https?:/i.test(html),false);
  assert.equal(html.includes('application/json'),false);
});
test('Step deadlines reject hanging promises',async()=>{
  const start=Date.now();await assert.rejects(withDeadline(async()=>new Promise(()=>{}),40),/deadline/);
  assert(Date.now()-start<1000);
});
test('Step deadlines propagate cancellation and clean up successful timers',async()=>{
  const controller=new AbortController();
  const work=withDeadline(async signal=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')))),10000,controller.signal);
  setTimeout(()=>controller.abort(),10);await assert.rejects(work);
  assert.equal(await withDeadline(async()=>42,10000),42);
});
