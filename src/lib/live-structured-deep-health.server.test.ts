import {describe,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {probeLiveStructuredDeepHealth,LIVE_STRUCTURED_HEALTH_CATEGORIES}
  from "./live-structured-deep-health.server";

const time="2026-10-17T12:00:00.000Z";
const now=()=>new Date(time);
type Category=(typeof LIVE_STRUCTURED_HEALTH_CATEGORIES)[number];
function response(category:Category,overrides:Record<string,unknown>={}){
 return {statusCode:200,body:{
  schema:"geomacro.live-structured.v1",status:"LIVE_SOURCE_FETCHED",
  category,coverage:"GLOBAL_CONTEXT_NOT_COUNTRY_VERIFIED",
  checked_at:time,source_checked_at:time,
  observations:[{
   kind:category==="geopolitics"?"seismic_hazard":
     category==="macro-fx"?"ecb_daily_fx_reference":"usgs_mcs_dataset_catalog",
   finding:"Provider observation verified at its own reference period",
   attribution:"Required provider credit",observation_period:"2026-10-16",
   clock_semantics:category==="geopolitics"?"event_occurrence":
     category==="macro-fx"?"reference_day":"dataset_edition",
   original_event_time_verified:category==="geopolitics",
   source_rights_scope:"REVIEWED_DATASET_ONLY",score:null,
  }],
  chargeable:false,payment_required:false,settlement_performed:false,
  durable_storage_written:false,signed_gro_required:false,signature:null,
  score:null,source_period_is_not_retrieval_time:true,
  ...overrides,
 }};
}
describe("independent stateless live product deep health",()=>{
 it("returns HTTP 200 only after ALL three real-response contracts pass",async()=>{
  const probe=vi.fn(async ({category}:{category:Category})=>response(category));
  const result=await probeLiveStructuredDeepHealth({probe,now});
  expect(probe).toHaveBeenCalledTimes(3);
  expect(result.statusCode).toBe(200);
  const body=result.body;
  expect(body.ok).toBe(true);
  expect(body.legacy_signed_intelligence_gri_risk_indices).toBe("NOT_EVALUATED_IN_THIS_PROFILE");
  expect(body.fresh_signed_snapshot_readiness_attested).toBe(false);
  expect(body.country_coverage_verified).toBe(false);
  expect(body.x402_payment_authorized).toBe(false);
  expect(body.new_intelligence_durable_storage_required).toBe(false);
  expect(body.categories.geopolitics.independently_verified_current_events).toBe(1);
  expect(body.categories["critical-minerals"].independently_verified_current_events).toBe(0);
 });
 it("fails HTTP 503 if one of three is missing rather than returning healthy",async()=>{
  const probe=async ({category}:{category:Category})=>
   category==="critical-minerals"?{statusCode:422,body:{status:"NO_ELIGIBLE_OBSERVATION"}}:
    response(category);
  const result=await probeLiveStructuredDeepHealth({probe,now});
  expect(result.statusCode).toBe(503);
  expect(result.body.categories["critical-minerals"].source_fetch_accepted).toBe(false);
  expect(result.body.categories["critical-minerals"].eligible_observations).toBe(0);
 });
 it("rejects stale retrieval clocks, false signed claims, and chargeable responses",async()=>{
  for(const mutation of [
    {checked_at:"2026-10-16T10:00:00.000Z"},
    {source_checked_at:"2026-10-17T12:05:00.000Z"},
    {chargeable:true},
    {signature:"fake-signature"},
    {settlement_performed:true},
    {source_period_is_not_retrieval_time:false},
  ]){
   const probe=async ({category}:{category:Category})=>
    response(category,category==="macro-fx"?mutation:{});
   const out=await probeLiveStructuredDeepHealth({probe,now});
   expect(out.statusCode,JSON.stringify(mutation)).toBe(503);
  }
 });
 it("never considers annual/calendar periods to be current signed intelligence",async()=>{
  const out=await probeLiveStructuredDeepHealth({now,probe:async ({category})=>response(category)});
  expect(out.body.categories["macro-fx"].independently_verified_current_events).toBe(0);
  expect(out.body.categories["critical-minerals"].independently_verified_current_events).toBe(0);
  expect(out.body.all_195_countries_fresh_news_verified).toBe(false);
 });
 it("keeps legacy /api/health?deep=1 signed B2/D1 rules intact",()=>{
  const route=readFileSync("src/routes/api.health.ts","utf8");
  expect(route).toContain('profile !== "live-structured"');
  expect(route).toContain("await getPublicProductionReadiness(deep)");
  expect(route).toContain('publicProduction.risk_verification_status === "verified"');
  expect(route).toContain("Object.values(publicProduction.hot_snapshot_serving ?? {}).every((proof) => proof.ok)");
  expect(route).toContain("status: deepReady ? 200 : 503");
  expect(route).toContain("status:scoped.statusCode");
 });
});
