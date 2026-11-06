#!/usr/bin/env node
/** Cloudflare provider GraphQL, real version-specific sampled invocations. */
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const version=process.env.NEW_VERSION_ID;
const since=new Date(Date.now()-Number(process.env.HEALTH_WINDOW_MINUTES??10)*60000).toISOString();
const until=new Date().toISOString();
if(!/^[a-f0-9]{32}$/i.test(account??'')||!token||
 !/^[a-f0-9-]{36}$/i.test(version??''))throw Error('TELEMETRY_AUTH_OR_VERSION_INVALID');
const query=`query($accountTag:String!,$start:Time!,$end:Time!){viewer{
 accounts(filter:{accountTag:$accountTag}){
  workersInvocationsAdaptive(limit:100,filter:{scriptName:"geomacro-control-plane",
   datetime_geq:$start,datetime_leq:$end}){
   dimensions{scriptName scriptVersion}
   sum{requests errors}
  }
 }}}`;
const r=await fetch('https://api.cloudflare.com/client/v4/graphql',{
 method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
 body:JSON.stringify({query,variables:{accountTag:account,start:since,end:until}}),
 signal:AbortSignal.timeout(16000)});
if(!r.ok)throw Error('WORKER_TELEMETRY_HTTP_UNAVAILABLE');
const j=await r.json();
if(j.errors?.length||j.data?.viewer?.accounts?.length!==1)throw Error('WORKER_TELEMETRY_UNVERIFIED');
const groups=j.data.viewer.accounts[0].workersInvocationsAdaptive;
if(!Array.isArray(groups)||groups.length>=100)throw Error('WORKER_TELEMETRY_TRUNCATED');
const matching=groups.filter(g=>g.dimensions?.scriptVersion===version);
const requests=matching.reduce((n,g)=>n+Number(g.sum?.requests??NaN),0);
const errors=matching.reduce((n,g)=>n+Number(g.sum?.errors??NaN),0);
const min=Number(process.env.MIN_CANARY_REQUESTS??20);
const maxErrorRate=Number(process.env.MAX_CANARY_ERROR_RATE??0.01);
if(!Number.isSafeInteger(requests)||!Number.isSafeInteger(errors)||
 !Number.isSafeInteger(min)||min<1||!Number.isFinite(maxErrorRate)||
 maxErrorRate<0||maxErrorRate>0.05||requests<min||errors/requests>maxErrorRate)
 throw Error('CANARY_REAL_TRAFFIC_ERROR_RATE_OR_SAMPLE_HELD');
console.log(JSON.stringify({stage:'WORKER_TELEMETRY',version,requests,errors,
 error_rate:errors/requests,min_required:min,window_from:since,window_to:until}));
