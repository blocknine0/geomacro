import {readFileSync} from "node:fs";
import {describe,it,expect,vi} from "vitest";
import {COUNTRY_CORRIDOR_PROBES,observeCountryCorridorOfficialSources} from
 "../../scripts/ops/observe-country-corridor-official-sources.mjs";
import {candidateCountrySourceCrosswalk,namedCorridorCandidateReference,
 candidateCorridorsForCountry,COUNTRY_CORRIDOR_CROSSWALK_STATUS} from
 "../../scripts/lib/operator-country-corridor-reference.mjs";

const country=JSON.parse(readFileSync("config/operator-country-source-crosswalk.v1.json","utf8"));
const corridor=JSON.parse(readFileSync("config/operator-corridor-source-crosswalk.v1.json","utf8"));
const date=new Date("2026-10-12T12:00:00Z");

describe("Claude-provided country and global-corridor source crosswalk",()=>{
 it("indexes all 108 country-source records across three domains without replacing canonical readers",()=>{
  expect(COUNTRY_CORRIDOR_CROSSWALK_STATUS).toMatchObject({
   global_sources:37,national_sources:71,corridor_sources:20,named_corridors:58,
   signed_risk_delivery_active:false
  });
  expect(country.global_country_dim).toHaveLength(37);
  expect(country.national_primary).toHaveLength(71);
  expect(new Set(country.global_country_dim.map((x:{id:string})=>x.id)).size).toBe(37);
  expect(new Set(country.national_primary.map((x:{id:string})=>x.id)).size).toBe(71);
  expect(country.source_runtime_activation_implied).toBe(false);
  expect(country.global_country_dim.find((x:{id:string})=>x.id==="reliefweb_country"))
   .toMatchObject({canonical_family_id:"reliefweb",provider_endpoint_version_deprecated:"v1 must not be polled"});
  expect(country.global_country_dim.find((x:{id:string})=>x.id==="acled_country")
    .source_activation_state).toBe("HOLD_TERMS_OR_PAYMENT_REVIEW");
  expect(country.global_country_dim.find((x:{id:string})=>x.id==="re_gov_policy_feeds")
    .canonical_family_id).toBeNull();
 });
 it("does not convert EU region or multiple-country cluster to fake ISO3 country",()=>{
  const eu=country.national_primary.filter((x:{country_group:string})=>x.country_group==="EU");
  expect(eu.length).toBeGreaterThan(0);
  expect(eu.every((x:{country_iso3:string[]})=>x.country_iso3.length===0)).toBe(true);
  const middle=country.national_primary.filter((x:{country_group:string})=>x.country_group==="ISR_IRN_SAU_ARE");
  expect(middle.every((x:{country_iso3:string[]})=>
   JSON.stringify(x.country_iso3)===JSON.stringify(["ISR","IRN","SAU","ARE"]))).toBe(true);
  const geopolitics=candidateCountrySourceCrosswalk("USA","geopolitics");
  expect(geopolitics.national_source_candidates.some(x=>x.source_id==="usa_ofac")).toBe(true);
  expect(geopolitics.global_source_candidates.some(x=>x.source_id==="reliefweb_country")).toBe(true);
  expect(geopolitics.commercial_verified_coverage).toBe(false);
  expect(()=>candidateCountrySourceCrosswalk("EU","macro_fx")).toThrow("COUNTRY_ISO3_REQUIRED");
 });
 it("retains 58 named distinct corridors with valid 20-source references, but no real geometry or scores",()=>{
  expect(corridor.corridors).toHaveLength(58);
  expect(corridor.source_registry).toHaveLength(20);
  expect(new Set(corridor.corridors.map((x:{id:string})=>x.id)).size).toBe(58);
  expect(corridor.unresolved_monitor_source_ids).toEqual([]);
  for(const r of corridor.corridors){
   expect(r.country_iso3.length).toBeGreaterThan(0);
   expect(r.country_iso3.every((iso:string)=>/^[A-Z]{3}$/.test(iso))).toBe(true);
   expect(r.monitor_refs.length).toBeGreaterThan(0);
   expect(r.monitor_refs.every((s:{link_state:string})=>s.link_state!=="UNRESOLVED_SOURCE_REFERENCE")).toBe(true);
   expect(r.criticality_analyst_unverified).toBeGreaterThanOrEqual(1);
   expect(r.criticality_analyst_unverified).toBeLessThanOrEqual(5);
   expect(r.current_risk_score).toBeNull();
   expect(r.physical_flow_data_verified).toBe(false);
   expect(r.commercial_signed_delivery_allowed).toBe(false);
  }
  const rare=namedCorridorCandidateReference("re_myanmar_to_china");
  expect(rare?.country_iso3).toEqual(["MMR","CHN"]);
  expect(rare?.category_tags).toContain("critical_minerals");
  expect(rare?.risk_score).toBeNull();
  expect(candidateCorridorsForCountry("CHN","critical_minerals").length).toBeGreaterThan(0);
  expect(namedCorridorCandidateReference("not-real")).toBeNull();
 });
 it("prevents external paid/restricted AIS/ACLED and routes from becoming entitled commercial inputs",()=>{
  const acled=corridor.source_registry.find((x:{source_id:string})=>x.source_id==="acled_corridor");
  const ais=corridor.source_registry.find((x:{source_id:string})=>x.source_id==="aisstream_corridor");
  const paid=corridor.source_registry.find((x:{source_id:string})=>x.source_id==="commodity_tanker_trackers");
  for(const x of [acled,ais,paid]){
   expect(x.activation_status).toBe("HOLD_PAYMENT_LICENSE_OR_TOS_REVIEW");
   expect(x.commercial_licence_verified).toBe(false);
  }
  expect(corridor.paid_risk_delivery_enabled).toBe(false);
 });
 it("probes three separate actual official no-key providers, storing only bounded aggregate metadata",async()=>{
  const fetchImpl=vi.fn(async(url:string)=>{
   const host=new URL(url).hostname;
   if(host==="bank.gov.ua"){
    return new Response(JSON.stringify([{r030:840,cc:"USD",rate:42.5,exchangedate:"12.10.2026"}]),{
     headers:{"content-type":"application/json"}
    });
   }
   return new Response(host.includes("jogmec")?
     "<!doctype html><html><body>JOGMEC 2026 press releases</body></html>":
     "<!doctype html><html><body>Maritime Security MSCI alerts</body></html>");
  });
  const r=await observeCountryCorridorOfficialSources({fetchImpl:fetchImpl as typeof fetch,now:date});
  expect(fetchImpl).toHaveBeenCalledTimes(3);
  expect(COUNTRY_CORRIDOR_PROBES.map(s=>s.domain))
   .toEqual(["geopolitics","macro_fx","critical_minerals"]);
  expect(r.status).toBe("ALL_THREE_OFFICIAL_CONTEXT_SOURCES_REACHABLE");
  expect(r.api_requests).toBe(3);
  expect(r.sources.every(x=>x.transport_state==="PRIVATE_OFFICIAL_METADATA_OBSERVED")).toBe(true);
  expect(r.sources.find(x=>x.id==="ukr_nbu")?.metadata_count).toBe(1);
  expect(r.original_report_content_stored).toBe(false);
  expect(r.sources.every(x=>!x.signed_gro&&!x.commercial_eligible&&!x.raw_data_stored)).toBe(true);
  expect(r.supabase_requests+r.d1_requests+r.b2_requests).toBe(0);
  expect(JSON.stringify(r)).not.toContain("42.5");
 });
 it("never circumvents 429 and cannot claim verified current intelligence from HTTP transport",async()=>{
  const fetchImpl=vi.fn(async()=>new Response(null,{status:429}));
  const r=await observeCountryCorridorOfficialSources({fetchImpl:fetchImpl as typeof fetch,now:date});
  expect(fetchImpl).toHaveBeenCalledTimes(3);
  expect(r.status).toBe("OFFICIAL_CONTEXT_DEGRADED");
  expect(r.sources.every(x=>x.transport_state==="DENIED_OR_QUOTA")).toBe(true);
  expect(r.country_and_corridor_scores_certified).toBe(false);
  expect(r.signed_intelligence_generated).toBe(false);
 });
});
