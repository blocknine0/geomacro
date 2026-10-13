import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {describe,expect,it,vi} from "vitest";
import {sameEventClaimHash} from "../../scripts/lib/independent-same-event-qualification.mjs";
import {
  checkGeomacroMachineOriginalRightsPreflight,
  type MachineOriginalWithRegistry,
} from "./geomacro-machine-source-rights.server";
import type {B2CommercialSourceRight} from "./b2-live.server";

const sha=(text:string)=>createHash("sha256").update(text).digest("hex");
const now=new Date("2026-10-10T11:00:00Z");
const event={
  country_iso3:"USA",event_type:"central_bank_policy",
  actor_id:"federal_reserve",target_id:"us_rates",
  location_id:"washington_dc",occurred_at:"2026-10-10T09:55:00Z",
};
const claim=sameEventClaimHash("macro",event);
const page=(iso:string)=>`<!DOCTYPE html><html><head>
  <meta property="article:published_time" content="${iso}">
  </head><body>Synthetic source fixture, not live first-party evidence</body></html>`;
const fedHtml=page("2026-10-10T10:05:00Z");
const ecbHtml=page("2026-10-10T10:10:00Z");
const fed:MachineOriginalWithRegistry={
  category:"macro",event,same_event_claim_sha256:claim,
  original_article_url:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261010a.htm",
  publisher_host:"www.federalreserve.gov",
  publisher_organization_id:"federal_reserve",
  originating_reporting_organization_id:"federal_reserve",
  source_registry_id:"fed_monetary_original_press_rss_review",
  private_only:true,native_published_at_verified:true,
  original_article_content_verified:true,
  original_publisher_url_verified:true,
  independently_authored_reporting_verified:true,
  syndicated_from:null,commercial_eligible:false,
  reporting_position:"confirms",original_article_sha256:sha(fedHtml),
  original_published_at:"2026-10-10T10:05:00Z",
};
const ecb:MachineOriginalWithRegistry={
  ...fed,
  original_article_url:"https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp261010.en.html",
  publisher_host:"www.ecb.europa.eu",
  publisher_organization_id:"ecb",
  originating_reporting_organization_id:"ecb",
  source_registry_id:"ecb",
  original_article_sha256:sha(ecbHtml),
  original_published_at:"2026-10-10T10:10:00Z",
};
const rights=():B2CommercialSourceRight[]=>[
  "fed_monetary_original_press_rss_review","ecb",
].map(source_id=>({
  source_id,category:"macro",certification_state:"CERTIFIED",
  commercial_usage_status:"DERIVED_ONLY",enabled_for_ingestion:true,
  enabled_for_commercial_signals:true,raw_redistribution_allowed:false,
  attribution_required:false,licence_name:"synthetic fixture, not lawful permission",
}));
function setup(
  candidates:MachineOriginalWithRegistry[]=[fed,ecb],
  registry:B2CommercialSourceRight[]|null=rights(),
){
  const fetchImpl=vi.fn(async(url:string)=>{
    const html=url===fed.original_article_url?fedHtml:ecbHtml;
    return new Response(html,{status:200,
      headers:{"content-type":"text/html"}});
  });
  const readRights=vi.fn(async()=>registry);
  const run=()=>checkGeomacroMachineOriginalRightsPreflight({
    candidates,now,fetchImpl:fetchImpl as unknown as typeof fetch,readRights,
  });
  return {run,fetchImpl,readRights};
}
describe("#2044 no-external-reviewer original content + B2 rights readback",()=>{
  it("accepts only a precommercial B2 registry checkpoint with no legal or x402 claim",async()=>{
    const t=setup();
    const result=await t.run();
    expect(result).toMatchObject({
      schema:"geomacro.private-automated-original-rights-preflight.v1",
      status:"B2_REGISTRY_COMPATIBLE_ARTICLE_PERMISSION_PENDING",
      original_reread_verified:true,registry_rights_compatible:true,
      actual_article_commercial_permission_verified:false,
      semantic_same_event_claim_verified:false,
      independent_external_reviewer_attested:false,
      signed_commercial_gro:false,payment_authorized:false,
      public_published:false,d1_writes:0,supabase_requests:0,payments:0,
    });
    expect(t.fetchImpl).toHaveBeenCalledTimes(2);
    expect(t.readRights).toHaveBeenCalledTimes(1);
    const output=JSON.stringify(result);
    for(const forbidden of ["federalreserve.gov","ecb.europa.eu",
      "synthetic fixture","fed_monetary_original_press_rss_review"]){
      expect(output).not.toContain(forbidden);
    }
  });
  it("rejects wrong publisher/source association before any HTML or rights GET",async()=>{
    for(const c of [
      {...ecb,source_registry_id:"un_news"},
      {...ecb,source_registry_id:"fed_monetary_original_press_rss_review"},
    ]){
      const t=setup([fed,c]);
      expect((await t.run()).status).toBe("SOURCE_INPUT_REJECTED");
      expect(t.fetchImpl).not.toHaveBeenCalled();
      expect(t.readRights).not.toHaveBeenCalled();
    }
  });
  it("never spends a B2 rights GET when original HTML hash mismatches or reviewer claims are disputed",async()=>{
    for(const c of [
      {...fed,original_article_sha256:sha("legacy URL hash")},
      {...ecb,reporting_position:"disputes"},
    ]){
      const t=setup([c===fed?fed:c,ecb]);
      const verdict=await t.run();
      expect(verdict.registry_rights_compatible).toBe(false);
      expect(verdict.payment_authorized).toBe(false);
      expect(t.readRights).not.toHaveBeenCalled();
    }
  });
  it("rejects denied, stale, incomplete, duplicated and attribution-required rights",async()=>{
    for(const rows of [
      null,
      rights().slice(0,1),
      [...rights(),rights()[0]],
      rights().map(r=>({...r,attribution_required:true})),
      rights().map(r=>({...r,commercial_usage_status:"INTERNAL_RESEARCH_ONLY"})),
      rights().map(r=>({...r,enabled_for_commercial_signals:false})),
      rights().map(r=>({...r,certification_state:"IN_REVIEW"})),
      rights().map(r=>({...r,category:"rare_earth"})),
      rights().map(r=>({...r,licence_name:""})),
    ]){
      const t=setup([fed,ecb],rows);
      const outcome=await t.run();
      expect(outcome.registry_rights_compatible).toBe(false);
      expect(outcome.payment_authorized).toBe(false);
      expect(outcome.signed_commercial_gro).toBe(false);
      expect(t.readRights).toHaveBeenCalledTimes(1);
    }
  });
  it("keeps old FEDERICO_STRICT independent signing checks and x402 settlement unchanged",()=>{
    const strict=readFileSync("src/lib/on-demand-reviewed-rights-qualifier.server.ts","utf8");
    const source=readFileSync("src/lib/geomacro-machine-source-rights.server.ts","utf8");
    expect(strict).toContain("approvedIndependentReviewerFromEnv()");
    expect(strict).toContain("qualifyIndependentSameEvent");
    expect(source).toContain("commercialSourceEligibilityFromRow");
    expect(source).toContain("verifyGeomacroTwoOriginalMachineBinding");
    expect(source).toContain("readB2CommercialSourceRights");
    expect(source).toContain("actual_article_commercial_permission_verified:false");
    for(const bad of ["settleCoinbaseX402","requireRiskSupabase","GEOMACRO_COMMERCE_LEDGER_TOKEN","D1.prepare"])
      expect(source).not.toContain(bad);
  });
});
