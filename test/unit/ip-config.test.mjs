import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { isPublicIP, normalizeIP, httpOrigin } from '../../dist/ip.js';
import { normalizeConfig, normalizeASN, normalizeOrigin } from '../../dist/config.js';

const base=()=>({baseURL:'https://app.example.test/shop',journeys:[{name:'Shop',steps:[{name:'Open',run:async()=>{}}]}]});
test('IPv4 / IPv6 normalization, compressed form and mapped addresses',()=>{
  assert.equal(normalizeIP('2001:4860:4860:0000:0000:0000:0000:8888'),'2001:4860:4860::8888');
  assert.equal(normalizeIP('::ffff:8.8.8.8'),'8.8.8.8');
  assert.equal(normalizeIP('::ffff:c0a8:101'),'192.168.1.1');
  assert.equal(normalizeIP('[::1]'),'::1');assert.equal(normalizeIP('fe80::1%eth0'),'fe80::1');
  assert.equal(normalizeIP('::'),'::');
});
test('Malformed IPs are rejected',()=>{
  for(const ip of ['999.1.1.1','example.test','8.8.8.8]','[::1','8.8.8.8%zone','0127.0.0.1','1:2:3'])assert.equal(normalizeIP(ip),null,ip);
});
test('Private, loopback, documentation and transition addresses are not sent to the API',()=>{
  for(const ip of ['0.0.0.0','10.1.2.3','127.0.0.1','100.64.1.2','169.254.169.254','172.16.1.1',
    '192.168.2.1','192.0.2.1','198.51.100.5','203.0.113.2','198.18.0.1','224.0.0.1','255.255.255.255',
    '::','::1','fc00::1','fe80::1','2001:db8::1','2002:808:808::1','3fff::1','::ffff:127.0.0.1'])assert.equal(isPublicIP(ip),false,ip);
});
test('Public addresses are eligible, including IPv4-mapped IPv6',()=>{
  for(const ip of ['8.8.8.8','1.1.1.1','172.15.255.255','172.32.0.1','2001:4860:4860::8888','2606:4700:4700::1111','::ffff:8.8.8.8'])assert.equal(isPublicIP(ip),true,ip);
});
test('Only HTTP(S) origins are collected; paths and credentials are stripped',()=>{
  assert.equal(httpOrigin('https://user:password@example.test:8443/private?token=SECRET#x'),'https://example.test:8443');
  assert.equal(httpOrigin('data:text/plain,hello'),null);assert.equal(httpOrigin('not a URL'),null);
});
test('Safe defaults protect the application origin and repeat the baseline',()=>{
  const c=normalizeConfig(base(),'/tmp/project');
  assert.deepEqual(c.firstPartyOrigins,['https://app.example.test']);assert.equal(c.baselineRuns,2);
  assert.equal(c.geo.mode,'live');assert.equal(c.geo.allowKeyless,false);assert.equal(c.diagnostics,false);
  assert.equal(c.outputDir,path.resolve('/tmp/project/geochaos-reports'));assert.deepEqual(c.groupBy,['country','asn']);
});
test('Origin exclusions are exact, canonical and reject path-level mistakes',()=>{
  assert.equal(normalizeOrigin('https://EXAMPLE.test:443/'),'https://example.test');
  for(const value of ['https://example.test/path','https://u:p@example.test','https://example.test/?token=x','file:///tmp'])assert.throws(()=>normalizeOrigin(value));
  const c=normalizeConfig({...base(),firstPartyOrigins:['https://api.example.test/']});
  assert.equal(c.firstPartyOrigins.length,2);
});
test('Config rejects misspelled, invalid and ambiguous options',()=>{
  for(const mutation of [{baselinRuns:1},{baselineRuns:0},{maxScenarios:101},{diagnostics:'false'},
    {groupBy:[]},{groupBy:['city']},{screenshots:'sometimes'},{baseURL:'file:///tmp'},
    {geo:{mode:'pretend'}},{geo:{mode:'live',fixtures:{'https://a.test':{}}}},{browser:{ignoreHTTPSErrors:true}}])
    assert.throws(()=>normalizeConfig({...base(),...mutation}));
});
test('Config requires meaningful named steps and unique journey names',()=>{
  assert.throws(()=>normalizeConfig({...base(),journeys:[]}));
  assert.throws(()=>normalizeConfig({...base(),journeys:[{name:'Empty',steps:[]}]}));
  assert.throws(()=>normalizeConfig({...base(),journeys:[base().journeys[0],base().journeys[0]]}));
  assert.throws(()=>normalizeConfig({...base(),journeys:[{name:'Bad',steps:[{name:'No function',run:'code'}]}]}));
});
test('Country and ASN filters are validated and normalized',()=>{
  const c=normalizeConfig({...base(),countries:['de'],asns:['AS0015169']});
  assert.deepEqual(c.countries,['DE']);assert.deepEqual(c.asns,['15169']);
  assert.throws(()=>normalizeConfig({...base(),countries:['Germany']}));
  assert.throws(()=>normalizeConfig({...base(),groupBy:['asn'],countries:['DE']}));
  assert.equal(normalizeASN(4294967295),'4294967295');
  for(const value of ['AS0','AS4294967296','-','abc',NaN,-1])assert.equal(normalizeASN(value),null);
});
test('Synthetic labels must be explicit and must be valid',()=>{
  const fixtures={'http://127.0.0.1:9999':{countryCode:'de',countryName:'Synthetic Germany',asn:'AS64501',asName:'Synthetic Network'}};
  const c=normalizeConfig({...base(),geo:{mode:'synthetic',fixtures}});
  assert.equal(c.geo.fixtures['http://127.0.0.1:9999'].countryCode,'DE');
  assert.equal(c.geo.fixtures['http://127.0.0.1:9999'].asn,'64501');
  assert.throws(()=>normalizeConfig({...base(),geo:{fixtures}}));
});

test('Normalization is idempotent for the public library API',()=>{
  const once=normalizeConfig(base());assert.deepEqual(normalizeConfig(once),once);
});
