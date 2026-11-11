import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,sign,createHash} from "node:crypto";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {verifyLiveGovernor,PINNED_CONTROL_PLANE}
 from "../ops/verify-risk-stream-b2-live-governor.mjs";
import {discoverShadowArticles,parseIndexRss,createGdeltLimiter}
 from "../lib/risk-stream-shadow-discovery.mjs";
import {validateAttesterKeys,verifyIndependentAttestations}
 from "../lib/risk-stream-shadow-attesters.mjs";
import {riskStreamOriginalClaims}
 from "../../workers/control-plane/src/risk-stream-pipeline.mjs";
import {preflight} from "../ops/provision-risk-stream-shadow-attester-keys.mjs";
import {B2_DAILY_LIMITS} from "../../workers/control-plane/src/b2-account-quota.mjs";

const live=()=>({ok:true,schema:"geomacro.b2-account-quota-status.v1",
 day_utc:new Date().toISOString().slice(0,10),used:{
 total:602,GET:100,PUT:450,HEAD:40,NATIVE_AUTH:12},
 limits:B2_DAILY_LIMITS});
test("DNS ENOTFOUND falls back to pinned REAL control-plane D1 (not shadow)",async()=>{
 const urls=[];
 const report=await verifyLiveGovernor({bearer:"a".repeat(64),
  lookupImpl:async()=>{const e=Error("DNS failure");e.code="ENOTFOUND";throw e},
  fetchImpl:async url=>{urls.push(url);return Response.json(live())}});
 assert.equal(report.status,"D1_SHARED_GOVERNOR_MATCH");
 assert.equal(report.dns_fallback_used,true);
 assert.equal(urls.length,1);
 assert.equal(urls[0],PINNED_CONTROL_PLANE+"/v1/b2-quota/status");
});
test("401 does not fall back and does not mask invalid authorization",async()=>{
 await assert.rejects(verifyLiveGovernor({bearer:"a".repeat(64),
  lookupImpl:async()=>({address:"127.0.0.1"}),
  fetchImpl:async()=>new Response("no",{status:401})}),/B2_LIVE_QUOTA_HTTP_401/);
});
test("fallback must not accept fabricated/stale policy or permissions",async()=>{
 const fake=live();fake.limits={...fake.limits,total:fake.limits.total+1};
 await assert.rejects(verifyLiveGovernor({bearer:"a".repeat(64),
  lookupImpl:async()=>{const e=Error("not found");e.code="ENOTFOUND";throw e},
  fetchImpl:async()=>Response.json(fake)}),/HOT50_B2_LIVE_GOVERNOR_POLICY_DRIFT/);
});
test("RSS parser emits only explicit country-associated index metadata",()=>{
 const xml='<rss><channel><item><title><![CDATA[US sanctions update]]></title>'+
 '<link>https://www.bbc.com/news/123</link>'+
 '<pubDate>Wed, 11 Nov 2026 12:00:00 GMT</pubDate></item>'+
 '<item><title>Anonymous topic</title><link>https://www.bbc.com/news/456</link>'+
 '<pubDate>Wed, 11 Nov 2026 12:00:00 GMT</pubDate></item></channel></rss>';
 const items=parseIndexRss(xml,{now:()=>Date.parse('2026-11-11T18:00:00Z')});
 assert.equal(items.length,1);
 assert.deepEqual(items[0].countries,["USA"]);
 assert.equal(items[0].feed_origin,"RSS");
});
test("after GDELT 429 RSS fallback happens before any GDELT reattempt",async()=>{
 let gdeltCalls=0,requests=[];
 const xml="<rss><channel>"+Array.from({length:20},(_,i)=>'<item><title>'+
   'US tariffs update '+i+'</title><link>https://www.bbc.com/news/'+(100+i)+
   '</link><pubDate>Wed, 11 Nov 2026 12:00:00 GMT</pubDate></item>').join("")+
   "</channel></rss>";
 const records=await discoverShadowArticles({
  fetchImpl:async url=>{
   const str=String(url);requests.push(str);
   if(str.includes("gdeltproject.org")){gdeltCalls++;return new Response("",{status:429})}
   return new Response(xml,{status:200});
  },sleep:async()=>{},now:()=>Date.parse('2026-11-11T18:00:00Z'),log:()=>{}});
 assert.equal(gdeltCalls,1);
 assert.equal(requests[0].includes("gdeltproject.org"),true);
 assert.equal(requests[1].includes("reutersagency.com"),true);
 assert.ok(records.length>=20);
 assert.ok(records.every(x=>x.feed_origin==="RSS"));
});
test("GDELT retry attempts are min 1 second apart and 3-stage bounded",async()=>{
 let time=0;
 const calls=[];
 const limiter=createGdeltLimiter({now:()=>time,sleep:async ms=>{time+=ms}});
 await limiter();calls.push(time);
 await limiter();calls.push(time);
 await limiter();calls.push(time);
 assert.deepEqual(calls,[0,1000,2000]);
});
test("two distinct Ed25519 attesters validate signed original claims, not mismatched claims",()=>{
 const facts=generateKeyPairSync("ed25519"),rights=generateKeyPairSync("ed25519");
 const b64=key=>key.export({format:"der",type:"spki"}).toString("base64");
 const {keys}=validateAttesterKeys(b64(facts.publicKey),b64(rights.publicKey));
 assert.throws(()=>validateAttesterKeys(b64(facts.publicKey),b64(facts.publicKey)),
  /INDEPENDENT_ATTESTER_KEYS_REQUIRED/);
 const raw_payload="original-licensed-source-bytes";
 const e={schema:"geomacro.risk-stream-candidate.v1",kind:"VERIFIED_ORIGINAL",
  country_iso3:"USA",category:"GEOPOLITICS",feed_origin:"RSS",
  event_key:"TEST_EVENT_001",event_fingerprint:"a".repeat(64),
  entities:["COUNTRY:USA","EVENT:TEST"],source_id:"demo_fact_source",
  source_url:"https://example.org/published",publisher_root_domain:"example.org",
  parent_media_entity:"sample_publisher",source_role:"INDEPENDENT_REGIONAL",
  published_at:"2026-11-11T12:00:00.000Z",
  original_page_sha256:createHash("sha256").update(raw_payload).digest("hex"),
  derived:{what:"Original fact demonstration",why:"Offline test only, not production evidence",
   market:"No production market consequence",watch:"Review source attestation"},
  raw_payload,proof:{}};
 const claim=riskStreamOriginalClaims(e);
 e.proof.facts_signature_b64=sign(null,Buffer.from(
  "geomacro.machine-original-facts.v1\n"+claim),facts.privateKey).toString("base64");
 e.proof.rights_signature_b64=sign(null,Buffer.from(
  "geomacro.machine-commercial-rights.v1\n"+claim),rights.privateKey).toString("base64");
 assert.equal(verifyIndependentAttestations(e,keys),true);
 assert.throws(()=>verifyIndependentAttestations({...e,source_url:"https://changed.example.org"},keys),
  /SHADOW_ATTESTATION_INVALID_/);
});

test("provider Retry-After beyond diagnostic budget defers GDELT, does not hammer provider",async()=>{
 let calls=0,logLines=[];
 const observations=await discoverShadowArticles({
  fetchImpl:async url=>{
   if(String(url).includes("gdeltproject.org")){
    calls++;return new Response("",{status:429,headers:{"Retry-After":"35"}});
   }
   return new Response("",{status:503});
  },sleep:async()=>{throw Error("DID_NOT_EXPECT_RETRY_SLEEP")},
  now:()=>Date.parse("2026-11-11T18:00:00Z"),
  log:(...args)=>logLines.push(args.join(" "))});
 assert.equal(calls,1);
 assert.equal(observations.length,0);
 assert.ok(logLines.includes("GDELT_RETRY_AFTER_DEFERRED_TO_NEXT_AUDIT"));
});
test("attester provisioning preflight rejects invalid facts signatures before any secrets write",()=>{
 const facts=generateKeyPairSync("ed25519"),rights=generateKeyPairSync("ed25519");
 const b64=key=>key.export({format:"der",type:"spki"}).toString("base64");
 const temp=mkdtempSync(join(tmpdir(),"geomacro-shadow-attester-"));
 try{
  const factsFile=join(temp,"facts.txt"),rightsFile=join(temp,"rights.txt");
  const sampleFile=join(temp,"attested.jsonl");
  writeFileSync(factsFile,b64(facts.publicKey));
  writeFileSync(rightsFile,b64(rights.publicKey));
  const raw_payload="TEST_ONLY_NOT_ORIGINAL_PRODUCTION_EVIDENCE";
  const e={schema:"geomacro.risk-stream-candidate.v1",kind:"VERIFIED_ORIGINAL",
   country_iso3:"USA",category:"GEOPOLITICS",feed_origin:"OFFICIAL_API",
   event_key:"TEST_EVENT_001",event_fingerprint:"a".repeat(64),
   entities:["COUNTRY:USA","EVENT:TEST"],source_id:"test_official",
   source_url:"https://example.org/test",publisher_root_domain:"example.org",
   parent_media_entity:"test_parent",source_role:"GOVERNMENT_WIRE",
   published_at:"2026-11-11T12:00:00.000Z",
   original_page_sha256:createHash("sha256").update(raw_payload).digest("hex"),
   derived:{what:"Unit test",why:"Unit test",market:"None",watch:"None"},
   raw_payload,proof:{}};
  const claim=riskStreamOriginalClaims(e);
  e.proof.facts_signature_b64=sign(null,Buffer.from(
   "geomacro.machine-original-facts.v1\n"+claim),facts.privateKey).toString("base64");
  e.proof.rights_signature_b64=sign(null,Buffer.from(
   "geomacro.machine-commercial-rights.v1\n"+claim),rights.privateKey).toString("base64");
  writeFileSync(sampleFile,JSON.stringify(e)+"\n");
  const valid=preflight({factsFile,rightsFile,sampleFile});
  assert.equal(valid.checked,1);
  assert.notEqual(valid.fingerprints.facts,valid.fingerprints.rights);
  e.proof.rights_signature_b64=e.proof.facts_signature_b64;
  writeFileSync(sampleFile,JSON.stringify(e)+"\n");
  assert.throws(()=>preflight({factsFile,rightsFile,sampleFile}),
   /SHADOW_ATTESTATION_INVALID_rights/);
 }finally{rmSync(temp,{recursive:true,force:true})}
});

test("terminal scorecard rejects 30 acknowledged RSS hints as 10 signed GROs",()=>{
 const temp=mkdtempSync(join(tmpdir(),"geomacro-shadow-scorecard-"));
 try{
  const dir=join(temp,".shadow-audit");mkdirSync(dir);
  const json=(name,value)=>writeFileSync(join(dir,name),JSON.stringify(value));
  json("metadata.json",{shadow_db:"geomacro-risk-stream-shadow",
   shadow_bucket:"geomacro-risk-stream-shadow-private",
   shadow_queue:"geomacro-risk-stream-shadow",shadow_dlq:"geomacro-risk-stream-shadow-dlq",
   commercial_delivery:false,risk_stream_active:false,independent_attester_keys:false});
  json("b2-governor-parity.json",{status:"D1_SHARED_GOVERNOR_MATCH",
   expected_b2_network_ops_for_shadow:0,verified_route:"PINNED_CONTROL_PLANE_WORKERS_DEV"});
  json("live-telemetry.json",{submitted_events:30,acknowledged_events:30,
   canonical_batch_receipts:3,d1_observed_503:0,
   signed_gro_count:0,verified_signature_readback_count:0,
   independent_signed_gro_acceptance:false});
  const result=spawnSync(process.execPath,
   [fileURLToPath(new URL("../ops/score-risk-stream-shadow-provider-audit.mjs",import.meta.url))],
   {cwd:temp,encoding:"utf8"});
  assert.equal(result.status,1);
  const report=JSON.parse(readFileSync(join(dir,"scorecard.json"),"utf8"));
  assert.equal(report.status,"HOLD_INCOMPLETE_SHADOW_PROOF");
  assert.equal(report.checks.live_d1_b2_governor_parity,true);
  assert.equal(report.checks.zero_observed_d1_503,true);
  assert.equal(report.checks.ten_signed_gros_with_d1_ed25519_readback,false);
  assert.equal(report.canary_hold_retained,true);
 }finally{rmSync(temp,{recursive:true,force:true})}
});
