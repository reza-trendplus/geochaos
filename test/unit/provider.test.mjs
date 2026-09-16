import test from 'node:test';
import assert from 'node:assert/strict';
import { IP2LocationClient, mapLimited } from '../../dist/geo.js';
const fixture=ip=>({ip,country_code:'US',country_name:'United States',asn:'15169',as:'Example Network'});
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});

test('Live lookups require a key or an explicit keyless opt-in',()=>{
  assert.throws(()=>new IP2LocationClient(),/IP2LOCATION_API_KEY/);
  assert.doesNotThrow(()=>new IP2LocationClient({allowKeyless:true}));
});
test('API uses HTTPS, Bearer auth, and never puts the key in the URL',async()=>{
  const client=new IP2LocationClient({apiKey:'test-secret-value',fetchImpl:async(url,options)=>{
    assert.equal(url.origin,'https://api.ip2location.io');assert.equal(url.searchParams.get('ip'),'8.8.8.8');
    assert.equal(url.searchParams.has('key'),false);assert.equal(options.headers.Authorization,'Bearer test-secret-value');
    assert.equal(options.redirect,'error');return json(fixture('8.8.8.8'));
  }});
  const result=await client.lookup('8.8.8.8');assert.equal(result.countryCode,'US');assert.equal(result.asn,'15169');assert.equal(result.source,'ip2location');
  assert.equal(JSON.stringify(result).includes('test-secret-value'),false);
});
test('Concurrent duplicate and mapped-IP lookups share one in-memory request',async()=>{
  let calls=0;const client=new IP2LocationClient({allowKeyless:true,fetchImpl:async()=>{calls++;await new Promise(r=>setTimeout(r,10));return json(fixture('8.8.8.8'));}});
  const results=await Promise.all([client.lookup('8.8.8.8'),client.lookup('::ffff:8.8.8.8'),client.lookup('8.8.8.8')]);
  assert.equal(calls,1);assert.equal(client.lookupCount,1);assert.deepEqual(results[0],results[2]);
});
test('Private, special-use and invalid IPs never produce API requests',async()=>{
  let calls=0;const client=new IP2LocationClient({allowKeyless:true,fetchImpl:async()=>{calls++;throw new Error('must not run');}});
  assert.equal((await client.lookup('127.0.0.1')).status,'non-public');
  assert.equal((await client.lookup('2001:db8::1')).status,'non-public');
  assert.equal((await client.lookup('garbage')).status,'unknown');assert.equal(calls,0);
});
test('Unique-IP budget is enforced without treating unlooked-up IPs as known',async()=>{
  let calls=0;const client=new IP2LocationClient({allowKeyless:true,maxLookups:1,fetchImpl:async url=>{calls++;return json(fixture(url.searchParams.get('ip')));}});
  assert.equal((await client.lookup('8.8.8.8')).status,'ok');
  const second=await client.lookup('1.1.1.1');assert.equal(second.status,'error');assert.match(second.reason,/budget/);assert.equal(calls,1);
});
test('Transient service failure gets one bounded retry',async()=>{
  let calls=0;const client=new IP2LocationClient({allowKeyless:true,fetchImpl:async()=>++calls===1?json({},503):json(fixture('8.8.8.8'))});
  assert.equal((await client.lookup('8.8.8.8')).status,'ok');assert.equal(calls,2);
});
test('Rate limiting stops after one retry and prevents later unique-IP requests',async()=>{
  let calls=0;const client=new IP2LocationClient({allowKeyless:true,fetchImpl:async()=>{calls++;return json({},429);}});
  assert.equal((await client.lookup('8.8.8.8')).status,'error');
  assert.equal((await client.lookup('1.1.1.1')).status,'error');assert.equal(calls,2);
});
test('Authentication errors disable further lookups and never echo provider content',async()=>{
  let calls=0;const client=new IP2LocationClient({apiKey:'private-key',fetchImpl:async()=>{calls++;return json({message:'private-key'},401);}});
  const result=await client.lookup('8.8.8.8');assert.equal(result.status,'error');
  assert.equal(JSON.stringify(result).includes('private-key'),false);
  await client.lookup('1.1.1.1');assert.equal(calls,1);
});
test('Mismatched response IP is an error, not silently accepted',async()=>{
  const client=new IP2LocationClient({allowKeyless:true,fetchImpl:async()=>json(fixture('1.1.1.1'))});
  const result=await client.lookup('8.8.8.8');assert.equal(result.status,'error');assert.match(result.reason,/did not match/);
});
test('Equivalent IPv6 response spellings are accepted',async()=>{
  const client=new IP2LocationClient({allowKeyless:true,fetchImpl:async()=>json(fixture('2001:4860:4860:0:0:0:0:8888'))});
  assert.equal((await client.lookup('2001:4860:4860::8888')).status,'ok');
});
test('Country and ASN coverage are independent',async()=>{
  const client=new IP2LocationClient({allowKeyless:true,fetchImpl:async()=>json({...fixture('8.8.8.8'),country_code:'-',country_name:'-'})});
  const result=await client.lookup('8.8.8.8');assert.equal(result.countryCode,null);assert.equal(result.asn,'15169');assert.equal(result.status,'ok');
});
test('Malformed JSON and provider error payloads yield safe unknown/error records',async()=>{
  for(const response of [()=>new Response('not JSON'),()=>json([]),()=>json({error:{error_message:'secret echoed by provider'}}),()=>json({country_code:'US'})]){
    const client=new IP2LocationClient({allowKeyless:true,fetchImpl:async()=>response()});
    const result=await client.lookup('8.8.8.8');assert.equal(result.status,'error');assert.equal(result.countryCode,null);
    assert.equal(JSON.stringify(result).includes('secret echoed'),false);
  }
});
test('Thrown fetch errors do not leak secrets or stack traces',async()=>{
  const client=new IP2LocationClient({apiKey:'NEVER-LOG',fetchImpl:async()=>{throw new Error('request failed key=NEVER-LOG');}});
  const result=await client.lookup('8.8.8.8');assert.equal(result.status,'error');assert.equal(JSON.stringify(result).includes('NEVER-LOG'),false);
});
test('A pre-cancelled lookup does not hit the network',async()=>{
  const controller=new AbortController();controller.abort();let calls=0;
  const client=new IP2LocationClient({allowKeyless:true,signal:controller.signal,fetchImpl:async()=>{calls++;return json({});}});
  assert.equal((await client.lookup('8.8.8.8')).status,'error');assert.equal(calls,0);
});
test('Concurrency-limited mapper preserves input order and the concurrency bound',async()=>{
  let active=0,peak=0;
  const values=await mapLimited([1,2,3,4,5],2,async n=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));active--;return n*2;});
  assert.deepEqual(values,[2,4,6,8,10]);assert.equal(peak,2);
});

test('Provider requests respect their timeout and do not retry indefinitely',async()=>{
  let calls=0;
  const client=new IP2LocationClient({allowKeyless:true,timeoutMs:30,fetchImpl:async(_url,options)=>{
    calls++;return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>resolve(json(fixture('8.8.8.8'))),500);
      options.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new Error('request aborted'));},{once:true});
    });
  }});
  const start=Date.now();const result=await client.lookup('8.8.8.8');
  assert.equal(result.status,'error');assert.equal(calls,2);assert(Date.now()-start<1000);
});
