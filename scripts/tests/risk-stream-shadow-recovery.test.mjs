import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,sign,createHash} from "node:crypto";
import {verifyLiveGovernor,PINNED_CONTROL_PLANE}
 from "../ops/verify-risk-stream-b2-live-governor.mjs";
import {discoverShadowArticles,parseIndexRss,createGdeltLimiter}
 from "../lib/risk-stream-shadow-discovery.mjs";
import {validateAttesterKeys,verifyIndependentAttestations}
 from "../lib/risk-stream-shadow-attesters.mjs";
import {riskStreamOriginalClaims}
 from "../../workers/control-plane/src/risk-stream-pipeline.mjs";
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
 const fake=live();fake.limits.total++;
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
