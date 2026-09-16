import { VERSION } from './version.js';
import assert from 'node:assert/strict';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { escapeHtml as h } from './privacy.js';
import { runGeoChaos } from './runner.js';
import type { GeoChaosConfig, Journey, RunOptions, RunOutput } from './types.js';

export interface DemoServers {
  appOrigin:string;
  recommendationOrigin:string;
  analyticsOrigin:string;
  counts:{recommendations:number;analytics:number};
  close:()=>Promise<void>;
}
async function listen(server:Server):Promise<string> {
  await new Promise<void>((resolve,reject) => {
    const onError=(e:Error):void=>reject(e);
    server.once('error',onError);
    server.listen(0,'127.0.0.1',()=>{server.off('error',onError);resolve();});
  });
  const address=server.address();
  if (!address || typeof address==='string') throw new Error('Could not bind demo server.');
  return `http://127.0.0.1:${address.port}`;
}
function end(res:ServerResponse,type:string,body:string,status=200):void {
  res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','Access-Control-Allow-Origin':'*',
    'X-Content-Type-Options':'nosniff'});res.end(body);
}
function storefront(resilient:boolean,recOrigin:string,analyticsOrigin:string):string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Northstar Supply - GeoChaos demo</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f2f4f1;color:#17272a;font:15px/1.6 system-ui,sans-serif}header{height:76px;background:#fff;border-bottom:1px solid #d5dfd9;display:flex;align-items:center;justify-content:space-between;padding:0 7%}.brand{font-weight:780;letter-spacing:-1px;font-size:23px}.brand span{color:#487869}.tag{font:10px ui-monospace,monospace;letter-spacing:1px;color:#56645f;border:1px solid #c5d1ca;border-radius:5px;padding:7px 10px}main{max-width:1080px;margin:36px auto;padding:0 24px}.eyebrow{font-size:11px;color:#486459;letter-spacing:2px;font-weight:700}h1{font-size:35px;font-weight:620;letter-spacing:-1px;line-height:1.2;margin:12px 0 20px}.grid{display:grid;grid-template-columns:1.05fr 1fr;gap:35px}.art{background:#dce8dd;border-radius:16px;min-height:310px;display:grid;place-items:center;position:relative}.art svg{width:240px;height:240px}.art small{position:absolute;bottom:16px;left:20px;font-size:10px;color:#536c5b;letter-spacing:1px}.product{background:#fff;border:1px solid #d5dfd9;border-radius:16px;padding:26px}.product h2{font-size:24px;font-weight:600;margin:0 0 6px;letter-spacing:-.5px}.product p{color:#60736d;font-size:13px}.price{font-size:26px;margin:16px 0}.button{background:#254f44;border:0;border-radius:7px;color:#fff;padding:13px 21px;font:600 13px system-ui;cursor:pointer;width:100%}.button:disabled{background:#a3ada7;cursor:not-allowed}.cart{margin-top:19px;padding:17px 0;border-top:1px solid #d9e1dc}.cart p{margin:0 0 13px}.recommendations{background:#fff;border:1px solid #d5dfd9;border-radius:12px;padding:16px 21px;margin-top:22px;display:flex;gap:20px;justify-content:space-between;font-size:12px}.recommendations strong{font-weight:620}.status{color:#60736d;font-size:11px}.error{color:#9a3e37!important;padding:10px 12px;background:#fff1ed;border-radius:6px;margin:12px 0!important}.success{background:#e1f2e7;padding:20px;border:1px solid #a5cfb6;border-radius:9px;color:#275a3a;margin-top:15px}.demo-note{color:#6b7773;font-size:11px;line-height:1.8;margin-top:23px}label{font-size:12px;color:#60736d}input{font:12px system-ui;border:1px solid #bccac0;border-radius:5px;padding:8px 10px;margin-left:8px;width:165px}.stock{font-size:11px;color:#48765a;margin-top:12px}.visually-hidden{position:absolute;left:-9999px}@media(max-width:720px){.grid{grid-template-columns:1fr}.art{min-height:180px}main{margin-top:20px}}
  </style></head><body><header><div class="brand">Northstar<span> Supply</span></div><span class="tag">LOCAL DEMO / ${resilient?'RESILIENT':'FRAGILE'}</span></header><main><div class="eyebrow">MADE FOR EVERYDAY EXPLORATION</div><h1>A lighter way to get outside.</h1><div class="grid"><div class="art" role="img" aria-label="Illustration of a green daypack"><svg viewBox="0 0 240 240" fill="none" aria-hidden="true"><ellipse cx="119" cy="214" rx="72" ry="10" fill="#b8cdbb"/><path d="M91 62V50c0-23 57-23 57 0v12" stroke="#345f4c" stroke-width="9"/><path d="M61 85c0-28 23-39 60-39s61 11 61 39v104c0 15-9 23-24 23H85c-15 0-24-8-24-23V85Z" fill="#65876b"/><path d="M73 87c0-19 17-28 47-28s47 9 47 28v13H73V87Z" fill="#739978"/><rect x="72" y="122" width="99" height="70" rx="12" fill="#436a51"/><path d="M85 134h73" stroke="#bfd0b0" stroke-width="3"/><path d="M169 98v23M62 98v23" stroke="#284634" stroke-width="5"/><rect x="111" y="79" width="20" height="22" rx="3" fill="#d4c79d"/><path d="M120 84v13M115 91h11" stroke="#5b7652" stroke-width="1.5"/></svg><small>TRAIL COLLECTION / 01</small></div><div class="product"><h2>Everyday Trail Pack</h2><p>A compact, thoughtfully organized daypack. Forest green. Made for the little adventures between the big ones.</p><div class="price">$48.00</div><label>Find a product<input aria-label="Search products" placeholder="Search the catalog"></label><p data-testid="search-result">Everyday Trail Pack</p><button class="button" id="add" type="button">Add to cart</button><div class="stock">In stock &middot; Ready for your next walk</div><div class="cart" id="cart" hidden><p><strong>1 item in your cart</strong></p><button class="button" id="checkout" type="button" ${resilient?'':'disabled'}>Complete checkout</button><p id="checkout-error" class="error" hidden></p></div><div id="confirmed" class="success" data-testid="order-confirmed" hidden><strong>Order confirmed</strong><br><small>Your synthetic order is complete. No payment was collected.</small></div></div></div><div class="recommendations"><div><strong>Recommended for your next trip</strong><div id="recommendations">Loading recommendations...</div></div><div class="status" data-testid="dependencies" data-settled="false">Dependency status: connecting</div></div><p class="demo-note">GeoChaos demonstration storefront. All services run on this computer; geographic and network labels are synthetic. The ${resilient?'resilient version keeps checkout independent of recommendations.':'fragile version incorrectly makes checkout depend on an optional recommendation service.'}</p><img src="${analyticsOrigin}/pixel.svg" width="1" height="1" alt="" class="visually-hidden"></main><script>
  const resilient=${JSON.stringify(resilient)};
  let ready=false;
  const checkout=document.querySelector('#checkout'),cart=document.querySelector('#cart');
  const error=document.querySelector('#checkout-error'),status=document.querySelector('[data-testid="dependencies"]');
  document.querySelector('#add').addEventListener('click',()=>{cart.hidden=false;checkout.disabled=!resilient&&!ready;if(!resilient&&!ready){error.hidden=false;error.textContent='Checkout unavailable: recommendation service did not load.';}});
  checkout.addEventListener('click',()=>{if(resilient||ready){document.querySelector('#confirmed').hidden=false;checkout.hidden=true;}});
  document.querySelector('input').addEventListener('input',event=>{document.querySelector('[data-testid="search-result"]').textContent='Everyday Trail Pack'.toLowerCase().includes(event.target.value.toLowerCase())?'Everyday Trail Pack':'No matching products';});
  fetch(${JSON.stringify(recOrigin+'/recommendations')},{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error('Recommendation service returned an error');return response.json();}).then(data=>{ready=true;checkout.disabled=false;document.querySelector('#recommendations').textContent=data.items.join(' / ');status.textContent='Dependency status: ready';}).catch(()=>{document.querySelector('#recommendations').textContent='Recommendations are temporarily unavailable.';status.textContent='Dependency status: degraded';console.error('Recommendation service unavailable');}).finally(()=>{status.dataset.settled='true';});
  </script></body></html>`;
}
export async function startDemoServers():Promise<DemoServers> {
  const counts={recommendations:0,analytics:0};
  const servers:Server[]=[];
  try {
    const recommendations=createServer((req,res)=>{
      if (req.url?.startsWith('/recommendations')) {counts.recommendations++;end(res,'application/json',JSON.stringify({items:['Pocket Field Notes','Trail Bottle']}));}
      else end(res,'text/plain','Not found',404);
    });servers.push(recommendations);
    const recommendationOrigin=await listen(recommendations);
    const analytics=createServer((req,res)=>{
      if (req.url?.startsWith('/pixel.svg')) {counts.analytics++;end(res,'image/svg+xml','<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');}
      else end(res,'text/plain','Not found',404);
    });servers.push(analytics);
    const analyticsOrigin=await listen(analytics);
    const app=createServer((req,res)=>{
      const path=(req.url??'/').split('?')[0];
      if (path==='/favicon.ico') {res.writeHead(204);res.end();return;}
      if (!['/','/fragile','/resilient'].includes(path??'')) {end(res,'text/plain','Not found',404);return;}
      end(res,'text/html; charset=utf-8',storefront(path==='/resilient',recommendationOrigin,analyticsOrigin));
    });servers.push(app);
    const appOrigin=await listen(app);
    return {appOrigin,recommendationOrigin,analyticsOrigin,counts,
      close:async()=>{await Promise.all(servers.map(server=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());})));}};
  } catch(error) {
    for(const server of servers){server.closeAllConnections();server.close();}throw error;
  }
}
function openStore(servers:DemoServers,variant:'fragile'|'resilient',inline:boolean):Journey['steps'][number] {
  return {name:'Open product',run:async({page,baseURL})=>{
    if (inline) {
      // Mount only our own bundled demo HTML; no browser policy is changed.
      await page.setContent(storefront(variant==='resilient',servers.recommendationOrigin,servers.analyticsOrigin),{waitUntil:'domcontentloaded'});
    } else {
      const response=await page.goto(baseURL,{waitUntil:'domcontentloaded'});
      assert(response?.ok(),'Storefront should respond successfully.');
    }
    await page.locator('[data-testid="dependencies"][data-settled="true"]').waitFor();
    assert.equal(await page.getByRole('heading',{name:'Everyday Trail Pack'}).isVisible(),true);
  }};
}
export function demoConfig(servers:DemoServers,variant:'fragile'|'resilient',outputDir:string,inline=false):GeoChaosConfig {
  return {
    name:variant==='fragile'?'Northstar / fragile checkout':'Northstar / resilient checkout',
    baseURL:`${servers.appOrigin}/${variant}`,outputDir,
    notes:inline?['INLINE DEMO: the bundled application document was mounted with Playwright setContent, not navigated. Dependency HTTP requests, observed IPs and failure interception are real. Top-level navigation was not tested.']:[],
    baselineRuns:2,scenarioRuns:1,groupBy:['country','asn'],
    actionTimeoutMs:1200,stepTimeoutMs:6000,settleMs:80,diagnostics:true,
    geo:{mode:'synthetic',fixtures:{
      [servers.recommendationOrigin]:{countryCode:'DE',countryName:'Germany (synthetic)',asn:'64501',asName:'Demo Recommendations Network'},
      [servers.analyticsOrigin]:{countryCode:'NL',countryName:'Netherlands (synthetic)',asn:'64502',asName:'Demo Analytics Network'}
    }},
    journeys:[
      {name:'Complete checkout',steps:[openStore(servers,variant,inline),
        {name:'Add to cart',run:async({page})=>{await page.getByRole('button',{name:'Add to cart',exact:true}).click();await page.getByText('1 item in your cart',{exact:true}).waitFor();}},
        {name:'Confirm order',run:async({page})=>{await page.getByRole('button',{name:'Complete checkout',exact:true}).click();await page.getByTestId('order-confirmed').waitFor();assert.equal(await page.getByTestId('order-confirmed').isVisible(),true);}}
      ]},
      {name:'Browse catalog',steps:[openStore(servers,variant,inline),
        {name:'Find a product',run:async({page})=>{await page.getByRole('textbox',{name:'Search products'}).fill('trail');assert.equal(await page.getByTestId('search-result').textContent(),'Everyday Trail Pack');}}
      ]}
    ]
  };
}
export interface DemoOutput {fragile:RunOutput;resilient:RunOutput;indexPath:string;}
export async function runDemo(outputDir:string,options:RunOptions & {inline?:boolean}={}):Promise<DemoOutput> {
  const directory=resolve(outputDir);
  await mkdir(directory,{recursive:true});
  const servers=await startDemoServers();
  try {
    options.onProgress?.('DEMO: real local browser requests, explicitly synthetic country and ASN labels.');
    const fragile=await runGeoChaos(demoConfig(servers,'fragile',join(directory,'fragile'),options.inline??false),options);
    if(options.signal?.aborted)throw new Error('Demo cancelled after fragile experiment.');
    const resilient=await runGeoChaos(demoConfig(servers,'resilient',join(directory,'resilient'),options.inline??false),options);
    const relative=(output:RunOutput,variant:string):string=>`${variant}/${output.report.runId}/report.html`;
    const indexPath=join(directory,'index.html');
    if (options.inline) options.onProgress?.('Inline demo: the local document was mounted directly; top-level navigation was not tested.');
    const success=fragile.report.summary.regressions===2&&resilient.report.summary.outcome==='passed';
    await writeFile(indexPath,`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GeoChaos - verified demo</title><style>body{margin:0;background:#0b111b;color:#eff5fc;font:16px/1.6 system-ui,sans-serif}main{max-width:950px;margin:75px auto;padding:0 28px}small{color:#74e0cf;letter-spacing:2px}h1{font-size:52px;line-height:1.12;letter-spacing:-2px;margin:16px 0}p{color:#a5b5ca;max-width:780px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:34px 0}article{background:#121c2a;border:1px solid #2a384b;border-radius:14px;padding:26px}h2{font-size:21px}.number{font-size:55px;line-height:1.2}a{display:inline-block;background:#74e0cf;color:#0b111b;padding:10px 17px;border-radius:7px;font-weight:700;text-decoration:none;margin-top:15px;font-size:13px}.warning{border-left:3px solid #f1cb85;padding:12px 18px;background:#342b1b;color:#f1cb85;border-radius:8px;font-size:13px}footer{font-size:12px;color:#a5b5ca;margin-top:35px}@media(max-width:650px){.grid{grid-template-columns:1fr}h1{font-size:38px}}</style><main><small>GEOCHAOS / CONTROLLED FAILURE TESTING</small><h1>One hidden dependency.<br>Two very different outcomes.</h1><p>The same checkout journey runs against two local storefronts. Both work normally. Only one keeps working when the recommendation-service origin is blocked.</p><div class="warning">Synthetic geography, real execution. The country and ASN labels below are fixtures. All browser assertions, aborted requests and screenshots come from actual local Chromium runs.${options.inline?' The application HTML was mounted directly with setContent; top-level navigation was not tested.':''}</div><div class="grid"><article><small>BEFORE / FRAGILE CHECKOUT</small><h2>Optional service.<br>Required by mistake.</h2><div class="number" style="color:#ffaaa5">${fragile.report.summary.regressions}</div><p>Regressed journey / scenario pairs.<br>Outcome: ${h(fragile.report.summary.outcome)}.</p><a href="${h(relative(fragile,'fragile'))}">Inspect failure evidence &rarr;</a></article><article><small>AFTER / RESILIENT CHECKOUT</small><h2>Graceful degradation.<br>Checkout stays independent.</h2><div class="number" style="color:#74e0cf">${resilient.report.summary.regressions}</div><p>Regressed journey / scenario pairs.<br>Outcome: ${h(resilient.report.summary.outcome)}.</p><a href="${h(relative(resilient,'resilient'))}">Inspect fixed application &rarr;</a></article></div><p>${success?'Demonstration verification passed: the fragile application failed exactly the two recommendation-group scenarios; the resilient application passed all tested scenarios.':'The demonstration did not match all expected outcomes. Inspect both reports before drawing conclusions.'}</p><footer>GeoChaos v${VERSION} &middot; <a href="https://www.ip2location.io/" style="background:none;color:#74e0cf;padding:0;margin:0;font-weight:400">IP Geolocation by IP2Location.io</a><br>No account, payment, or external API was used by this local demo.<br>Vibe coded with ChatGPT Pro 6. AI-assisted development; maintainer review required.</footer></main></html>`);
    return {fragile,resilient,indexPath};
  } finally {await servers.close();}
}
