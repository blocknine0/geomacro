import {createHash} from "node:crypto";
import {describe,it,expect,vi} from "vitest";
import {sameEventClaimHash}
 from "../../scripts/lib/independent-same-event-qualification.mjs";
import {checkGeomacroSingleOriginalRightsPreflight}
 from "./geomacro-single-original-rights-preflight.server";
import type {MachineOriginalWithRegistry} from "./geomacro-machine-source-rights.server";
import type {B2CommercialSourceRight} from "./b2-live.server";

const sha=(s:string)=>createHash("sha256").update(s).digest("hex");
const now=new Date("2026-10-17T11:00:00Z");
const article='<html><head><meta property="article:published_time" content="2026-10-17T10:05:00Z"></head>'+
 '<body>Completely synthetic first-party body, neither real news nor legal permission.</body></html>';
const event={
 country_iso3:"USA",event_type:"central_bank_policy",
 actor_id:"federal_reserve",target_id:"discount_rate",
 location_id:"washington_dc",occurred_at:"2026-10-17T10:00:00Z",
};
const candidate:MachineOriginalWithRegistry={
 category:"macro",event,
 same_event_claim_sha256:sameEventClaimHash("macro",event),
 original_article_url:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261017a.htm",
 publisher_host:"www.federalreserve.gov",
 publisher_organization_id:"federal_reserve",
 originating_reporting_organization_id:"federal_reserve",
 source_registry_id:"fed_monetary_original_press_rss_review",
 private_only:true,native_published_at_verified:true,
 original_article_content_verified:true,
 original_publisher_url_verified:true,
 independently_authored_reporting_verified:true,syndicated_from:null,
 commercial_eligible:false,reporting_position:"confirms",
 original_article_sha256:sha(article),original_published_at:"2026-10-17T10:05:00Z",
};
const rights: B2CommercialSourceRight[]=[{
 source_id:"fed_monetary_original_press_rss_review",
 category:"macro",certification_state:"CERTIFIED",
 commercial_usage_status:"DERIVED_ONLY",enabled_for_ingestion:true,
 enabled_for_commercial_signals:true,raw_redistribution_allowed:false,
 attribution_required:false,licence_name:"synthetic rights registry, NOT an article grant",
}];
const fetchImpl=vi.fn(async(url:string)=>{
 expect(url).toBe(candidate.original_article_url);
 return new Response(article,{status:200,headers:{"content-type":"text/html"}});
});
const readRights=vi.fn(async()=>rights);
const run=(c:MachineOriginalWithRegistry=candidate,rr=readRights)=>
 checkGeomacroSingleOriginalRightsPreflight({
  candidate:c,now,fetchImpl:fetchImpl as unknown as typeof fetch,
  readRights:rr,
 });
describe("founder one original, strict commercial rights preflight",()=>{
 it("one original SHA and native clock is enough for facts, never a commercial licence",async()=>{
  fetchImpl.mockClear();readRights.mockClear();
  const r=await run();
  expect(r.status).toBe("B2_REGISTRY_COMPATIBLE_SINGLE_ARTICLE_PERMISSION_PENDING");
  expect(r.verified_original_count).toBe(1);
  expect(r.independent_original_count).toBe(0);
  expect(r.original_byte_readback_verified).toBe(true);
  expect(r.source_registry_compatible).toBe(true);
  expect(r.actual_article_commercial_permission_verified).toBe(false);
  expect(r.facts_signature_verified).toBe(false);
  expect(r.rights_signature_verified).toBe(false);
  expect(r.signed_commercial_gro).toBe(false);
  expect(r.public_hot_published).toBe(false);
  expect(r.payment_authorized).toBe(false);
  expect(r.b2_writes).toBe(0);
  expect(readRights).toHaveBeenCalledTimes(1);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
 });
 it("denies a spoofed source ID before any source or commercial registry request",async()=>{
  fetchImpl.mockClear();readRights.mockClear();
  const r=await run({...candidate,source_registry_id:"wrong_source"});
  expect(r.status).toBe("SOURCE_REGISTRY_OR_INPUT_INVALID");
  expect(readRights).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
 });
 it("a missing article body hash never consumes rights quota",async()=>{
  fetchImpl.mockClear();readRights.mockClear();
  const r=await run({...candidate,original_article_sha256:sha("forged")});
  expect(r.status).toBe("ORIGINAL_BYTES_OR_CLOCK_UNVERIFIED");
  expect(readRights).not.toHaveBeenCalled();
 });
 it("rejects attribution required, research only, registry gaps and permission metadata",async()=>{
  for(const variant of [
   rights.map(r=>({...r,attribution_required:true})),
   rights.map(r=>({...r,commercial_usage_status:"INTERNAL_RESEARCH_ONLY"})),
   rights.map(r=>({...r,certification_state:"IN_REVIEW"})),
   rights.map(r=>({...r,licence_name:""})),
   [],
  ]){
   const out=await run(candidate,async()=>variant as B2CommercialSourceRight[]);
   expect(out.source_registry_compatible).toBe(false);
   expect(out.actual_article_commercial_permission_verified).toBe(false);
   expect(out.signed_commercial_gro).toBe(false);
  }
 });
});
