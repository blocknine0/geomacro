import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {sameEventClaimHash} from "./independent-same-event-qualification.mjs";
import {verifyGeomacroSingleOriginalBinding}
 from "./geomacro-single-original-binding.mjs";
import {verifyGeomacroOriginalPages,verifyGeomacroSingleOriginalPage}
 from "./geomacro-original-page-readback.mjs";

const now=new Date("2026-10-17T11:00:00Z");
const text='<html><head><meta property="article:published_time" content="2026-10-17T10:05:00Z"></head>'+
 '<body>Entirely synthetic first-party reference release. No actual event or rights asserted here.</body></html>';
const sha=x=>createHash("sha256").update(x).digest("hex");
const event={country_iso3:"USA",event_type:"central_bank_policy",
 actor_id:"federal_reserve",target_id:"discount_rate",
 location_id:"washington_dc",occurred_at:"2026-10-17T10:00:00Z"};
const candidate={
 category:"macro",event,same_event_claim_sha256:sameEventClaimHash("macro",event),
 original_article_url:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261017a.htm",
 publisher_host:"www.federalreserve.gov",
 publisher_organization_id:"federal_reserve",
 originating_reporting_organization_id:"federal_reserve",
 source_registry_id:"fed_monetary_original_press_rss_review",
 private_only:true,native_published_at_verified:true,
 original_article_content_verified:true,original_publisher_url_verified:true,
 independently_authored_reporting_verified:true,syndicated_from:null,
 commercial_eligible:false,reporting_position:"confirms",
 original_article_sha256:sha(text),original_published_at:"2026-10-17T10:05:00Z",
};
const fetchImpl=async(url,opts)=>{
 assert.equal(url,candidate.original_article_url);
 assert.equal(opts.redirect,"error");
 assert.equal(opts.method,"GET");
 return new Response(text,{status:200,headers:{"content-type":"text/html"}});
};
test("one genuine first-party original byte digest/native time is enough for a factual candidate",async()=>{
 const out=await verifyGeomacroSingleOriginalBinding({candidate,now,fetchImpl});
 assert.equal(out.accepted,true);
 assert.equal(out.verified_first_party_original_count,1);
 assert.equal(out.status,"SINGLE_ORIGINAL_FACTUAL_EVIDENCE_VERIFIED_RIGHTS_PENDING");
 assert.equal(out.original_article_sha256,sha(text));
 assert.equal(out.original_native_publication_at,"2026-10-17T10:05:00.000Z");
 assert.match(out.exact_original_evidence_set_sha256,/^[a-f0-9]{64}$/u);
 assert.equal(out.independent_original_source_count,0);
 assert.equal(out.independent_same_event_corroboration_verified,false);
 assert.equal(out.article_specific_commercial_rights_verified,false);
 assert.equal(out.signed_commercial_gro,false);
 assert.equal(out.public_hot_published,false);
 assert.equal(out.payment_authorized,false);
 assert.equal(out.b2_requests,0);
 assert.equal(out.d1_writes,0);
 assert.equal(out.supabase_requests,0);
 assert.equal(out.payments,0);
 const receipt=JSON.stringify(out);
 assert.equal(Object.hasOwn(out,"original_article_url"),false);
 assert.equal(Object.hasOwn(out,"raw_html"),false);
});
test("old multi-source verifier still REQUIRES TWO originals",async()=>{
 await assert.rejects(verifyGeomacroOriginalPages({
  originals:[{
   category:"macro",same_event_claim_sha256:candidate.same_event_claim_sha256,
   originating_reporting_organization_id:candidate.originating_reporting_organization_id,
   original_article_url:candidate.original_article_url,
   original_published_at:candidate.original_published_at,
   reporting_position:"confirms",expected_html_sha256:candidate.original_article_sha256,
  }],now,fetchImpl,
 }),/GEOMACRO_PRIVATE_PAGE_READBACK_INPUT_INVALID/);
});
test("one original reader is distinct from independent-original legacy proof",async()=>{
 const result=await verifyGeomacroSingleOriginalPage({original:{
  category:"macro",same_event_claim_sha256:candidate.same_event_claim_sha256,
  originating_reporting_organization_id:candidate.originating_reporting_organization_id,
  original_article_url:candidate.original_article_url,
  original_published_at:candidate.original_published_at,
  reporting_position:"confirms",expected_html_sha256:candidate.original_article_sha256,
 },now,fetchImpl});
 assert.equal(result.schema,"geomacro.private-single-original-page-readback.v1");
 assert.equal(result.original_source_count,1);
 assert.equal(result.independent_same_event_sources_verified,false);
 assert.equal(result.commercial_rights_verified,false);
 assert.equal(result.signed_commercial_gro,false);
});
test("tampered SHA, stale native clock, denied HTML never qualify",async()=>{
 const variants=[
  {...candidate,original_article_sha256:sha("made up")},
  {...candidate,original_published_at:"2026-10-17T10:20:00Z"},
 ];
 for(const bad of variants){
  const result=await verifyGeomacroSingleOriginalBinding({candidate:bad,now,fetchImpl});
  assert.equal(result.accepted,false);
  assert.equal(result.status,"ORIGINAL_BYTES_OR_CLOCK_UNVERIFIED");
 }
 const denied=await verifyGeomacroSingleOriginalBinding({candidate,now,
  fetchImpl:async()=>new Response("blocked",{status:403,headers:{"content-type":"text/html"}})});
 assert.equal(denied.accepted,false);
});
test("publisher spoof, unknown claim and future/stale originals rejected before network",async()=>{
 let calls=0;
 const noFetch=async()=>{calls++;return new Response(text)};
 for(const bad of [
  {...candidate,publisher_host:"federalreserve.gov.attacker.invalid"},
  {...candidate,original_article_url:"https://example.invalid/releases/monetary20261017a.htm"},
  {...candidate,syndicated_from:"https://other.example/repost"},
  {...candidate,same_event_claim_sha256:sha("forged claim")},
  {...candidate,original_published_at:"2026-10-17T12:00:00Z"},
  {...candidate,original_published_at:"2026-10-17T04:00:00Z"},
  {...candidate,original_article_url:candidate.original_article_url+"?url=https://attacker.test/"},
  {...candidate,category:"rare_earth"},
 ]){
  await assert.rejects(verifyGeomacroSingleOriginalBinding({candidate:bad,now,
   fetchImpl:noFetch}),/GEOMACRO_SINGLE_ORIGINAL_INPUT_INVALID/);
 }
 assert.equal(calls,0);
});
