import {describe,it,expect,vi} from "vitest";
import {
 COUNTRY_TIER_MODULES,computeCoverageGrade,buildCountryTierIndex,
 classifyCountryModulePreflight,evaluateCountryTier,
} from "@/lib/country-tier-coverage.server";
import {buildAgentQueryPlan} from "@/lib/agent-query-plan";
import {preflightCountryTier} from "@/lib/earn-first-structural-offers.server";
import type {AgentQueryDeliverability} from "@/lib/agent-query-deliverability.server";

const NOW=new Date("2026-10-25T00:00:00.000Z");
const subject={type:"country",country_iso3:"IND"} as const;
const planFor=(topic:string)=>buildAgentQueryPlan({
 schema_version:"geomacro.agent-query.v1",
 product:{capability:"structural_country_digest",variant:"standard"},
 subjects:[subject],topics:[topic],delivery_tier:"structural_baseline",
 fulfillment_mode:"published_only",detail:"standard",evidence:"required",
});
const result=(plan:ReturnType<typeof buildAgentQueryPlan>,eligible=true):AgentQueryDeliverability=>({
 deliverable:eligible,
 code:eligible?"AVAILABLE":"INSUFFICIENT_COVERAGE",
 query_plan_hash:plan.query_plan_hash,
 checked_at:NOW.toISOString(),
 missing_modules:eligible?[]:[...plan.required_modules],
 stale_modules:[],
 ineligible_source_ids:[],
 source_contracts:[{source_id:"DO_NOT_PRINT_RAW_SOURCE_ID",commercial_usage_status:"DERIVED_ONLY",
   raw_redistribution_allowed:false,attribution_required:false,licence_name:null}],
 subjects:[{subject:plan.subjects[0],status:"AVAILABLE",
   available_modules:eligible?[...plan.required_modules]:[],
   latest_evidence_at:eligible?"2026-10-24T15:00:00.000Z":null,
   required_source_ids:["DO_NOT_PRINT_RAW_SOURCE_ID"],
   governed_fallback_modules:[]}],
});
const modulesFor=(eligible:string[],statusForRest:"NOT_ELIGIBLE"|"RUNTIME_UNAVAILABLE"|"STALE"="NOT_ELIGIBLE")=>
 COUNTRY_TIER_MODULES.map(x=>({
  module:x.module,
  status:eligible.includes(x.module)?"ELIGIBLE" as const:statusForRest,
  observation_period:null,as_of:null,
  rights_state:eligible.includes(x.module)?"VERIFIED" as const:"UNKNOWN" as const,
  reason_code:eligible.includes(x.module)?null:"NO_ADAPTER_OR_NO_VERIFIED_SOURCE",
 }));
const request=(payload:unknown,headers:Record<string,string>={})=>new Request(
 "https://geomacro.live/api/v1/intelligence/availability?view=country-tiers",
 {method:"POST",headers:{"content-type":"application/json",...headers},
  body:JSON.stringify(payload)},
);
describe("195-country structural and live tier classification",()=>{
 it("S0 means four independently assessed unsuccessful modules, not just 195 routing",()=>{
   const grade=computeCoverageGrade(modulesFor([]));
   expect(grade.structural_grade).toBe("S0");
   expect(grade.eligible_modules).toBe(0);
   expect(grade.unscored).toBe(true);
 });
 it("S1 one eligible, S2 two dimensions even within macro, S3 three domains",()=>{
   expect(computeCoverageGrade(modulesFor(["macro_monetary"])).structural_grade).toBe("S1");
   expect(computeCoverageGrade(modulesFor(["macro_monetary","external_fx"])).structural_grade).toBe("S2");
   expect(computeCoverageGrade(modulesFor(["macro_monetary","external_fx","critical_minerals"])).structural_grade).toBe("S2");
   const g=computeCoverageGrade(modulesFor(["geopolitical_security","macro_monetary","critical_minerals"]));
   expect(g.structural_grade).toBe("S3");
   expect(g.eligible_domains).toEqual(["geopolitics","macro","rare_earth"]);
 });
 it("runtime source outages never become S0, and eligibility is a floor only",()=>{
   const g=computeCoverageGrade(modulesFor(["critical_minerals"],"RUNTIME_UNAVAILABLE"));
   expect(g.structural_grade).toBeNull();
   expect(g.structural_grade_status).toBe("RUNTIME_UNAVAILABLE");
   expect(g.observed_grade_floor).toBe("S1");
 });
 it("exact paid path hash, current period, rights and scope required",()=>{
   const p=planFor("critical_minerals");
   const valid=classifyCountryModulePreflight("critical_minerals",p,result(p),NOW.getTime());
   expect(valid.status).toBe("ELIGIBLE");
   expect(valid.rights_state).toBe("VERIFIED");
   expect(valid.as_of).toBe("2026-10-24T15:00:00.000Z");
   expect(valid.observation_period).toBeNull();
   expect(classifyCountryModulePreflight("critical_minerals",p,{
     ...result(p),source_contracts:[],
   },NOW.getTime()).status).toBe("NOT_ELIGIBLE");
   expect(classifyCountryModulePreflight("critical_minerals",p,{
     ...result(p),subjects:[{...result(p).subjects[0],
       latest_evidence_at:"2099-01-01T00:00:00.000Z"}],
   },NOW.getTime()).status).not.toBe("ELIGIBLE");
   const stale={...result(p,false),code:"STALE_REQUIRED_DATA" as const,
     missing_modules:[],stale_modules:["critical_minerals"]};
   expect(classifyCountryModulePreflight("critical_minerals",p,stale,NOW.getTime()).status).toBe("STALE");
   expect(classifyCountryModulePreflight("critical_minerals",p,{
     ...result(p),query_plan_hash:"f".repeat(64),
   },NOW.getTime()).status).toBe("RUNTIME_UNAVAILABLE");
 });
 it("entire registry is ISO3 195, Vatican and Palestine included, not falsely paid-ready",()=>{
   const r=buildCountryTierIndex(NOW);
   expect(r.country_count).toBe(195);
   expect(r.countries).toHaveLength(195);
   expect(new Set(r.countries.map(x=>x.country_iso3)).size).toBe(195);
   expect(r.countries.some(x=>x.country_iso3==="VAT"&&x.observer_state)).toBe(true);
   expect(r.countries.some(x=>x.country_iso3==="PSE"&&x.observer_state)).toBe(true);
   expect(r.countries.every(x=>x.structural_grade===null&&x.live_grade===null&&
     x.execution_authorized===false)).toBe(true);
   expect(r.S_grade_counts).toBeNull();
 });
 it("country-specific four exact digest preflights compute S2, L1 with 72h news only",async()=>{
   const check=vi.fn(async p=>result(p,
     ["macro_monetary","external_fx"].includes(p.required_modules[0])));
   const r=await evaluateCountryTier("IND",{now:NOW,check,
     live:async()=>({journal_accessible:true,derived_news_count:2})});
   expect(check).toHaveBeenCalledTimes(4);
   expect(r.structural_grade).toBe("S2");
   expect(r.live_grade).toBe("L1");
   expect(r.signed_L2_independent_verification_performed).toBe(false);
   expect(r.execution_authorized).toBe(false);
   expect(r.payment_required_now).toBe(false);
   expect(JSON.stringify(r)).not.toContain("DO_NOT_PRINT_RAW_SOURCE_ID");
 });
 it("temporary source failure does not turn an unassessed module into an S grade",async()=>{
   const r=await evaluateCountryTier("VAT",{now:NOW,
     check:async()=>{throw Error("SECRET_SOURCE_HTTP_DENIED")},
     live:async()=>{throw Error("BROKEN_D1_JOURNAL")}});
   expect(r.structural_grade).toBeNull();
   expect(r.live_grade).toBeNull();
   expect(r.modules.every(m=>m.status==="RUNTIME_UNAVAILABLE")).toBe(true);
   expect(JSON.stringify(r)).not.toMatch(/SECRET_SOURCE|BROKEN_D1/);
 });
 it("existing availability endpoint handles bounded no-money country tier query",async()=>{
   const reply=await preflightCountryTier(request({country_iso3:"IND"}),{
     rateLimit:()=>true,now:NOW,check:async p=>result(p,false),
     live:async()=>({journal_accessible:true,derived_news_count:0}),
   });
   const body=await reply.json();
   expect(reply.status).toBe(200);
   expect(body.country_iso3).toBe("IND");
   expect(body.structural_grade).toBe("S0");
   expect(body.live_grade).toBe("L0");
   expect(body.execution_authorized).toBe(false);
   expect(body.chargeable).toBe(false);
 });
 it("invalid foreign country and payment headers rejected before source access",async()=>{
   for(const iso of ["ZZZ","US","USA ","pse"]){
     const p=await preflightCountryTier(request({country_iso3:iso}),{
       rateLimit:()=>true,check:async()=>{throw Error("MUST_NOT_RUN")},
     });
     expect(p.status).toBe(400);
   }
   const refused=await preflightCountryTier(request({country_iso3:"IND"},
     {"payment-signature":"payer-supplied"}),{rateLimit:()=>true});
   expect(refused.status).toBe(400);
 });
});
