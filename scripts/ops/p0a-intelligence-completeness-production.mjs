#!/usr/bin/env node
/** Real-production P0-A evidence-quality acceptance. No mock D1, synthetic
 * articles, new paid providers, B2 requests, charges, or source disclosures.
 * Uses authenticated canonical D1 + deployed internal HTTP and publishes only
 * redacted aggregated evidence. Existing source originals remain immutable.
 */
import {mkdirSync,writeFileSync} from "node:fs";
import {createHmac} from "node:crypto";
import {p0aAuditBatch,p0aAuditOriginal} from "../lib/p0a-evidence-quality.mjs";
import {phase2hOneOriginalResearchFivePart} from "../../workers/control-plane/src/phase2h-private-raw-news.mjs";
const ORIGIN="https://geomacro-control-plane.daspallab202391.workers.dev";
const PATH="artifacts/derived-news/p0a-production-intelligence-completeness.json";
const CATEGORIES=["geopolitics","macro","rare_earth"];
const HEX=/^[a-f0-9]{64}$/u;
const responseSummary=(body)=>{
 mkdirSync("artifacts/derived-news",{recursive:true,mode:0o700});
 writeFileSync(PATH,JSON.stringify(body,null,2)+"\n",{mode:0o600});
};
const fail=code=>{throw Error("P0A_PRODUCTION_"+code)};
const api=async(url,init)=>{
 const resp=await fetch(url,{redirect:"error",signal:AbortSignal.timeout(15000),...init});
 const body=await resp.json().catch(()=>null);
 if(resp.status!==200||!body||resp.redirected)fail("PROVIDER_HTTP_UNAVAILABLE");
 return body;
};
export async function runP0AProductionAcceptance({
 env=process.env,fetchImpl=fetch,now=new Date(),
 write=responseSummary
}={}){
 if(env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main"||env.GITHUB_ACTIONS!=="true"||
    !/^[a-f0-9]{32}$/u.test(env.CLOUDFLARE_ACCOUNT_ID??"")||
    (env.CLOUDFLARE_API_TOKEN??"").length<20||
    (env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").length<32||
    !Number.isFinite(now.getTime()))
   fail("CANONICAL_PRODUCTION_AUTH_REQUIRED");
 const base="https://api.cloudflare.com/client/v4/accounts/"+env.CLOUDFLARE_ACCOUNT_ID;
 const call=async(url,init={})=>{
  const r=await fetchImpl(url,{redirect:"error",signal:AbortSignal.timeout(15000),...init});
  const json=await r.json().catch(()=>null);
  if(r.status!==200||json?.success!==true)fail("CANONICAL_PROVIDER_RESPONSE_INVALID");
  return json.result;
 };
 const databases=await call(base+"/d1/database?per_page=100",{
  headers:{Authorization:"Bearer "+env.CLOUDFLARE_API_TOKEN}
 });
 const matches=databases.filter(x=>x.name==="geomacro-control-plane");
 if(matches.length!==1||!/^[a-f0-9-]{36}$/iu.test(matches[0].uuid))
  fail("CANONICAL_D1_ID_UNVERIFIED");
 const endpoint=base+"/d1/database/"+matches[0].uuid+"/query";
 const cutoff=new Date(now.getTime()-72*60*60_000).toISOString();
 const query=async(sql,params)=>{
  const result=await call(endpoint,{method:"POST",
   headers:{Authorization:"Bearer "+env.CLOUDFLARE_API_TOKEN,
    "Content-Type":"application/json"},
   body:JSON.stringify({sql,params})});
  if(!Array.isArray(result)||result.length!==1||result[0].success===false||
     !Array.isArray(result[0].results))fail("CANONICAL_D1_READ_UNVERIFIED");
  return result[0].results;
 };
 const perCategory={},samples=[];
 for(const cat of CATEGORIES){
  const rows=await query(
   "SELECT record_id,category,raw_json,b2_object_sha256 FROM phase2h_private_raw_news "+
   "WHERE category=? AND first_ingested_at>=? "+
   "ORDER BY original_published_at DESC,record_id LIMIT 40",[cat,cutoff]);
  const records=[];
  for(const dbRow of rows){
   if(!HEX.test(dbRow.record_id)||dbRow.category!==cat||
      typeof dbRow.raw_json!=="string")fail("CANONICAL_ROW_INVALID");
   let parsed;
   try{parsed=JSON.parse(dbRow.raw_json)}catch{fail("CANONICAL_JSON_INVALID")}
   if(parsed.record_id!==dbRow.record_id||parsed.category!==dbRow.category||
      !HEX.test(parsed.raw_sha256))fail("CANONICAL_IDENTITY_DIVERGED");
   const projected=phase2hOneOriginalResearchFivePart(parsed);
   if(!projected)fail("LIVE_QUALITY_PROJECTION_UNAVAILABLE");
   // Immutable D1/B2 originals are never rewritten. Audit the exact
   // read-time derived representation customers/machines would receive.
   const effective={...parsed,analysis:projected};
   records.push(effective);
   samples.push({row:effective,archived:HEX.test(dbRow.b2_object_sha256??"")});
  }
  const quality=p0aAuditBatch(records);
  perCategory[cat]={...quality.counts[cat],
   issue_counts:quality.issue_counts,
   sample_limited_to_40:rows.length===40,
   archived_sample:rows.filter(x=>HEX.test(x.b2_object_sha256??"")).length};
 }
 const aggregate=p0aAuditBatch(samples.map(x=>x.row));
 const token=createHmac("sha256",env.GEOMACRO_COMMERCE_LEDGER_TOKEN)
  .update("geomacro-control-plane-v1").digest("hex");
 const httpSamples={geopolitics:false,macro:false,rare_earth:false};
 // At least one independent HTTP read per supported category from an
 // ACTUAL canonical D1-staged and B2-acknowledged news record, not fabricated.
 for(const cat of CATEGORIES){
  const example=samples.find(x=>x.row.category===cat&&
     p0aAuditOriginal(x.row).status==="PASS");
  if(!example)continue;
  const r=await fetchImpl(ORIGIN+"/v1/internal/phase2h-raw-news?"+
    new URLSearchParams({record_id:example.row.record_id,
     question:"Why does this particular development matter?",
     p0a_probe:"1"}),{
    method:"GET",redirect:"error",cache:"no-store",
    headers:{Authorization:"Bearer "+token,"Cache-Control":"no-store",
     Accept:"application/json"},signal:AbortSignal.timeout(15000)});
  const body=await r.json().catch(()=>null);
  const one=body?.question_matches?.[0];
  httpSamples[cat]=r.status===200&&!r.redirected&&body?.ok===true&&
    body.source==="CANONICAL_D1_PRIVATE_P0A_QUALITY_READBACK"&&
    body.chargeable===false&&body.paid_eligible===false&&
    body.raw_original_not_delivered===true&&
    body.question_matches.length===1&&one.record_id===example.row.record_id&&
    one.category===cat&&one.focus==="why_it_matters"&&
    one.archive_d1_ack_present===example.archived&&
    one.direct_answer===example.row.analysis.why_it_matters.text&&
    JSON.stringify(one.five_part)===JSON.stringify(example.row.analysis);
 }
 const allSampledGrounded=CATEGORIES.every(c=>perCategory[c].total>0&&
  perCategory[c].pass>0&&perCategory[c].reject===0&&
  perCategory[c].pass+perCategory[c].limited===perCategory[c].total);
 const allLiveReadbacks=CATEGORIES.every(c=>httpSamples[c]);
 const passed=allSampledGrounded&&allLiveReadbacks&&
    aggregate.no_unsupported_claims;
 const receipt={schema:"geomacro.p0a.production-intelligence-completeness.v1",
  status:passed?"PASS_REAL_PRODUCTION_EVIDENCE":"NOT_ACCEPTED",
  checked_at:now.toISOString(),audited_main_sha:env.GITHUB_SHA??null,
  source:"CANONICAL_CLOUDFLARE_D1_AND_DEPLOYED_AUTHENTICATED_WORKER",
  category_audit:perCategory,quality_issue_counts:aggregate.issue_counts,
  all_sampled_live_projections_evidence_bounded:allSampledGrounded,
  independent_deployed_canonical_d1_five_part_readback:httpSamples,
  all_three_deployed_readbacks_verified:allLiveReadbacks,
  no_unsupported_quantitative_market_or_followup_claims:
    aggregate.no_unsupported_claims,
  original_page_content_independently_verified:false,
  whole_world_coverage_verified:false,
  commerce_authorized:false,payments:0,
  accepted:passed};
 write(receipt);
 if(!passed)fail("QUALITY_OR_LIVE_READBACK_INCOMPLETE");
 return receipt;
}
if(process.argv[1]&&import.meta.url.endsWith("/p0a-intelligence-completeness-production.mjs")){
 try{console.log(JSON.stringify(await runP0AProductionAcceptance()))}
 catch(e){
  const msg=String(e?.message??"");
  console.error("::error::"+(/^P0A_PRODUCTION_[A-Z_]+$/u.test(msg)?msg:
   "P0A_PRODUCTION_ACCEPTANCE_UNVERIFIED"));
  process.exitCode=3;
 }
}
