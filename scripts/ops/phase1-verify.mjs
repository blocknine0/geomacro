#!/usr/bin/env node
/** Zero-funds API smoke + protected boundary tests with exact version override. */
const base=process.env.API_ORIGIN??'https://api.geomacro.live';
const version=process.env.NEW_VERSION_ID;
const sha=process.env.GITHUB_SHA;
const token=process.env.CONTROL_PLANE_TOKEN;
const ssr=process.env.GEOMACRO_CUSTOMER_SSR_TOKEN;
const scope=process.env.SMOKE_SCOPE??'canary';
if(!/^https:\/\/[a-z0-9.-]+$/.test(base)||
 !/^[0-9a-f-]{36}$/i.test(version??'')||
 !/^[a-f0-9]{40}$/.test(sha??'')||!token||token.length<32||
 !ssr||ssr.length<64)throw Error('CANARY_SMOKE_CONFIGURATION_REQUIRED');
const override=`geomacro-control-plane="${version}"`;
async function hit(path,{method='GET',auth,ssrAuth,body}={}){
 const headers={'Cache-Control':'no-store',
  'Cloudflare-Workers-Version-Overrides':override,
  ...(auth?{Authorization:'Bearer '+token}:{}),
  ...(ssrAuth?{Authorization:'Bearer '+ssr,Origin:'https://geomacro.live'}:{}),
  ...(body!==undefined?{'Content-Type':'application/json'}:{})};
 const r=await fetch(base+path,{method,headers,redirect:'error',cache:'no-store',
  ...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(16000)});
 const raw=await r.text();if(raw.length>2_000_000)throw Error('SMOKE_RESPONSE_TOO_LARGE');
 let data;try{data=JSON.parse(raw)}catch{throw Error('SMOKE_NON_JSON_'+path)}
 return {code:r.status,data};
}
function insist(condition,label){if(!condition)throw Error('CANARY_'+label+'_FAILED')}
const h=await hit('/health');
insist(h.code===200&&h.data.ok===true&&h.data.store==='d1'&&
 h.data.deployed_source_sha===sha&&h.data.d1_hotspot_v2_enabled===true&&
 h.data.payment_runtime_locked===true,'EXACT_VERSION_HEALTH_SHA_FLAGS_LOCK');
const anonymous=await hit('/v1/internal/risk-gate/signing-automation');
insist(anonymous.code===401,'ANONYMOUS_ADMIN_DENIAL');
const signing=await hit('/v1/internal/risk-gate/signing-automation',{auth:true});
insist(signing.code===200&&signing.data?.ok===true,'SIGNING_HEALTH');
const key=await hit('/v1/public/risk-gate-decision-key');
insist(key.code===200&&key.data?.schema==='geomacro.risk-gate-decision-key.v1'&&
 key.data?.scheme==='Ed25519','SIGNING_PUBLIC_KEY');
const locked=await hit('/v1/internal/customer/paid-authorize',
 {method:'POST',ssrAuth:true,body:{}});
insist(locked.code===503&&locked.data?.code==='CUSTOMER_PAID_RUNTIME_NOT_ACCEPTED',
 'PAYMENT_LOCK');
if(scope==='warm'){
 const warm=await hit('/v1/internal/hot50-cqrs-refresh',{method:'PUT',auth:true});
 insist(warm.code===200&&warm.data?.ok===true&&
  warm.data?.schema==='geomacro.hot50-cqrs-canary-ack.v1','PRODUCER_ACK');
}
const publicNews=await hit('/v1/public/website-derived-news-bundle');
insist(publicNews.code===200&&publicNews.data?.schema===
 'geomacro.website-derived-news-bundle.v1'&&publicNews.data?.chargeable===false,
 'PUBLIC_CQRS');
console.log(JSON.stringify({schema:'geomacro.phase1-canary-smoke.v1',
 stage:scope,ok:true,sha,version,public_api:200,signing:200,
 anonymous_admin:401,payment_locked:true,no_funds:true}));
