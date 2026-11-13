#!/usr/bin/env node
/** Rotate bounded metadata-only global discovery through Hot50 cells that
 * lack publisher-native facts in the preceding 72 hours. */
import {createHash} from 'node:crypto';
import {RISK_GATE_HOT50} from '../../workers/control-plane/src/risk-gate-hot50-scope.mjs';
import {phase2hCountry} from '../../scripts/lib/phase2h-country-originals-195.mjs';
import {p0bGlobalNewsFallback} from '../lib/p0b-live-global-search.mjs';

const API='https://api.cloudflare.com/client/v4';
const ORIGIN='https://geomacro-control-plane.daspallab202391.workers.dev';
const SEARCH_CATEGORIES=Object.freeze([
 ['GEOPOLITICS','geopolitics'],['MACRO_FX','macro'],['CRITICAL_MINERALS','rare_earth']
]);
const sha=value=>createHash('sha256').update(value).digest('hex');
const fail=code=>{throw Error('HOT50_GLOBAL_SEARCH_'+code)};
const iso=ms=>new Date(ms).toISOString();

export function planGlobalSearchTargets(now=Date.now(),limit=10){
 if(!Number.isSafeInteger(now)||!Number.isInteger(limit)||limit<1||limit>15)
  fail('PLAN_INVALID');
 const all=RISK_GATE_HOT50.flatMap(country=>SEARCH_CATEGORIES.map(([source,category])=>({
  country_iso3:country,category,source_category:source,
  country_name:phase2hCountry(country)?.name
 })));
 if(all.length!==150||all.some(x=>!x.country_name))fail('HOT50_SCOPE_DRIFT');
 const start=(Math.floor(now/(20*60_000))*limit)%all.length;
 return Array.from({length:limit},(_,i)=>all[(start+i)%all.length]);
}

export async function supplementEmptyCells({targets,hasFreshOriginal,search,
 project,now=Date.now()}={}){
 if(!Array.isArray(targets)||typeof hasFreshOriginal!=='function'||
    typeof search!=='function'||typeof project!=='function')fail('INPUT_INVALID');
 let cellsChecked=0,searches=0,observationsProjected=0;
 for(const target of targets){
  cellsChecked++;
  if(await hasFreshOriginal(target,now))continue;
  searches++;
  const result=await search(target,now);
  const projected=[];
  for(const item of result?.first_party_matches??[]){
   const title=String(item?.original_title??'').normalize('NFKC').trim();
   const url=String(item?.original_url??'');
   const clock=String(item?.original_published_at??'');
   if(title.length<10||title.length>300||!Number.isFinite(Date.parse(clock))||
      Date.parse(clock)>now+60_000||now-Date.parse(clock)>72*60*60_000)continue;
   let parsed;try{parsed=new URL(url)}catch{continue;}
   const domain=parsed.hostname.toLowerCase().replace(/^www\./u,'');
   if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||
      parsed.hash||!domain||domain.length>253)continue;
   const derived=target.category;
   projected.push({country_iso3:target.country_iso3,derived_category:derived,
    event_fingerprint:sha([target.country_iso3,derived,
     title.toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu,' ').trim()].join('\n')),
    publisher_domain:domain,canonical_source_url:parsed.href,event_clock:iso(Date.parse(clock)),
    clock_basis:'INDEX_OBSERVED',extracted_entities:[target.country_iso3,derived],
    source_id:domain,title_sha256:sha(title),fact_basis:'SEARCH_TITLE_ONLY',
    original_page_fetched:false,rights_verified:false,commercial_eligible:false});
  }
  for(let i=0;i<projected.length;i+=25){
   const batch=projected.slice(i,i+25);
   const receipt=await project(batch);
   if(receipt?.ok!==true||receipt.rights_verified!==false||
      receipt.commercial_eligible!==false||receipt.standard_corroboration_admitted!==false||
      receipt.accepted!==batch.length)fail('PROJECTION_RECEIPT_INVALID');
   observationsProjected+=receipt.accepted;
  }
 }
 return {schema:'geomacro.hot50-global-search-facts.v1',status:'PASS',
  cells_checked:cellsChecked,global_searches:searches,
  observations_projected:observationsProjected,
  original_page_fetches:0,standard_corroboration_admitted:false,
  rights_verified:false,commercial_eligible:false};
}

async function d1Query(env,sql,params){
 const url=`${API}/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${env.D1_DATABASE_ID}/query`;
 const response=await fetch(url,{method:'POST',redirect:'error',headers:{
  Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json',
  Accept:'application/json'},body:JSON.stringify({batch:[{sql,params}]}),
  signal:AbortSignal.timeout(15000)});
 const data=await response.json().catch(()=>null),row=data?.result?.[0];
 if(!response.ok||data?.success!==true||row?.success!==true||
    !Array.isArray(row?.results)||!Number.isSafeInteger(row?.meta?.rows_read)||
    row.meta.rows_read>500||row.meta.rows_written!==0)fail('D1_READBACK_INVALID');
 return row.results;
}

export async function runHot50GlobalSearchSupplement({env=process.env,now=Date.now(),
 targets=planGlobalSearchTargets(now),search=p0bGlobalNewsFallback,fetchImpl=fetch}={}){
 if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_REPOSITORY!=='blocknine0/geomacro'||
    env.GITHUB_REF!=='refs/heads/main'||!env.GEOMACRO_COMMERCE_LEDGER_TOKEN||
    !/^[a-f0-9]{32}$/iu.test(env.CLOUDFLARE_ACCOUNT_ID??'')||
    !/^[a-f0-9-]{36}$/iu.test(env.D1_DATABASE_ID??'')||
    (env.CLOUDFLARE_API_TOKEN??'').length<20)
  fail('PROTECTED_MAIN_REQUIRED');
 const targetJson=JSON.stringify(targets.map(t=>[t.country_iso3,t.source_category]));
 const rows=await d1Query(env,`WITH targets AS (
   SELECT json_extract(value,'$[0]') AS country_iso3,json_extract(value,'$[1]') AS category
   FROM json_each(?)
  ) SELECT t.country_iso3,t.category,
   EXISTS(SELECT 1 FROM progressive_risk_gate_facts f
    WHERE f.country_iso3=t.country_iso3 AND f.category=CASE t.category
      WHEN 'GEOPOLITICS' THEN 'geopolitics' WHEN 'MACRO_FX' THEN 'macro'
      ELSE 'rare_earth' END AND f.clock_basis='ORIGINAL_PUBLICATION'
      AND f.event_clock>=? AND f.event_clock<=?) AS has_fresh_original
  FROM targets t`,[targetJson,iso(now-72*60*60_000),iso(now)]);
 const fresh=new Set(rows.filter(r=>Number(r.has_fresh_original)===1)
  .map(r=>r.country_iso3+'|'+r.category));
 const projection=async observations=>{
  const response=await fetchImpl(ORIGIN+'/v1/internal/risk-gate/progressive-observations',{
   method:'POST',redirect:'error',cache:'no-store',headers:{
    Authorization:'Bearer '+env.GEOMACRO_COMMERCE_LEDGER_TOKEN,
    'Content-Type':'application/json',Accept:'application/json','Cache-Control':'no-store'},
   body:JSON.stringify({schema:'geomacro.progressive-observation-projection-request.v1',observations}),
   signal:AbortSignal.timeout(15000)});
  const receipt=await response.json().catch(()=>null);
  if(response.status!==200)return null;
  return receipt;
 };
 return supplementEmptyCells({targets,now,
  hasFreshOriginal:async t=>fresh.has(t.country_iso3+'|'+t.source_category),
  search:async t=>search({question:`${t.country_name} ${t.category} developments`,
   countryIso3:t.country_iso3,category:t.category,now,fetchImpl}),
  project:projection});
}

if(import.meta.url===new URL(process.argv[1]??'',`file://${process.cwd()}/`).href){
 try{console.log(JSON.stringify(await runHot50GlobalSearchSupplement()));}
 catch(error){console.error(JSON.stringify({status:'HOLD',code:/^HOT50_GLOBAL_SEARCH_[A-Z0-9_]+$/u.test(error?.message??'')?error.message:'HOT50_GLOBAL_SEARCH_UNAVAILABLE',rows_written:0}));process.exitCode=2;}
}
