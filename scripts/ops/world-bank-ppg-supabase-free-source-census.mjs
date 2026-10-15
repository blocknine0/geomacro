#!/usr/bin/env bun
/**
 * World Bank PPG source-only country census: no direct-Postgres, Supabase,
 * B2 GET, D1 mutation or inference of other three Risk Gate module states.
 * The full four-module census is a SEPARATE fail-closed acceptance boundary.
 */
import { readFileSync,writeFileSync } from "node:fs";
import {createHash} from "node:crypto";
import { COUNTRIES_195,CANONICAL_195_VERSION } from "../../src/lib/canonical-country-registry-195.ts";
const HASH=/^[a-f0-9]{64}$/u;
const SOURCE=process.env.WORLD_BANK_PPG_SHADOW_OUTPUT??"world-bank-ppg-sovereign-fiscal-shadow.json";
const OUTPUT=process.env.GLOBAL_RISK_GATE_PPG_SHADOW_CENSUS_OUTPUT??"global-risk-gate-country-ppg-shadow-census.json";
const TARGET=Number(process.env.GLOBAL_RISK_GATE_PPG_SHADOW_TARGET_COUNTRIES??100);
function assert(x,c){if(!x)throw Error(c)}
function canonical(x){
 if(Array.isArray(x))return x.map(canonical);
 if(x&&typeof x==="object")return Object.fromEntries(Object.entries(x)
    .sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
 return x;
}
const sha=x=>createHash("sha256").update(JSON.stringify(canonical(x))).digest("hex");
export function auditPpgSourceOnlyCensus(report,target=100){
 assert(Number.isSafeInteger(target)&&target>0&&target<=195,"PPG_SOURCE_CENSUS_TARGET_INVALID");
 assert(report?.schema_version==="geomacro-world-bank-ppg-sovereign-fiscal-shadow-1.0" &&
   report.writes_performed===false&&report.production_activation_allowed===false&&
   report.scoring_production_changed===false&&report.country_payability_changed===false&&
   report.base_mainnet_gate_changed===false&&
   HASH.test(String(report.report_hash??"")) &&
   sha({...report,report_hash:""})===report.report_hash,
   "PPG_SOURCE_CENSUS_SHADOW_PROOF_INVALID");
 assert(report.shadow_summary?.target_reached===true &&
   report.normalization?.peer_count>=20 &&
   report.methodology_boundary?.fixed_20_peer_minimum_preserved===true &&
   report.methodology_boundary?.raw_values_pooled_with_central_or_general_government_debt===false &&
   report.methodology_boundary?.ppg_external_debt_relabelled_as_total_government_debt===false,
   "PPG_SOURCE_CENSUS_METHODOLOGY_OR_PEER_INVALID");
 const countries=new Set(COUNTRIES_195.map(c=>c.iso3));
 const accepted=new Set();
 const excludedOutside195=new Set();
 const seenSourceIso3=new Set();
 const rejected=new Set();
 for(const state of report.states??[]){
   const m=/^rgv2:([A-Z]{3}):sovereign_fiscal:world-bank-ppg-external-debt:/.exec(String(state.module_state_id??""));
   if(!m||seenSourceIso3.has(m[1])||
      state.module!=="sovereign_fiscal" ||
      state.coverage!=="LIMITED" ||
      state.commercial_eligibility_status!=="VERIFIED")
      throw Error("PPG_SOURCE_CENSUS_MODULE_STATE_INVALID");
   seenSourceIso3.add(m[1]);
   // World Bank source universe includes economic entities not in the
   // founder-locked UN193+two observer sovereign routing baseline (e.g.
   // XKX). Never promote such source entities into one of the 195 cells.
   if(countries.has(m[1]))accepted.add(m[1]);
   else excludedOutside195.add(m[1]);
 }
 assert(seenSourceIso3.size===report.shadow_summary.eligible_shadow_country_count &&
   accepted.size+excludedOutside195.size===seenSourceIso3.size,
   "PPG_SOURCE_CENSUS_PROOF_COUNT_MISMATCH");
 for(const c of COUNTRIES_195)if(!accepted.has(c.iso3))rejected.add(c.iso3);
 assert(accepted.size+rejected.size===195,"PPG_SOURCE_CENSUS_COUNTRY_UNIVERSE_INVALID");
 const targetReached=accepted.size>=target;
 return {
   schema:"geomacro.ppg-supabase-free-source-shadow-census.v1",
   registry_version:CANONICAL_195_VERSION,
   source:"World Bank PPG / GNI annual ratio",
   source_report_sha256:report.report_hash,
   country_count:195,
   ppg_fiscal_shadow_countries:accepted.size,
   excluded_noncanonical_source_economies:excludedOutside195.size,
   source_fiscal_country_or_economy_count:seenSourceIso3.size,
   ppg_fiscal_missing_countries:rejected.size,
   target_country_count:target,
   source_only_target_reached:targetReached,
   // Must never assert the 100-country *four-module* Risk Gate result:
   four_module_country_census_status:"NOT_ASSESSED_MISSING_INDEPENDENT_NON_SUPABASE_MODULE_SNAPSHOTS",
   four_module_accepted_country_count:null,
   independent_geopolitical_modules_not_asserted:true,
   independent_political_modules_not_asserted:true,
   independent_macro_modules_not_asserted:true,
   shadow_only:true,verified_source_observations_not_current_news:true,
   ppg_external_debt_not_total_government_debt:true,
   no_raw_cross_source_value_pooling:true,
   production_activation_allowed:false,
   production_country_payability_changed:false,
   scoring_production_changed:false,
   x402_chargeable:false,
   supabase_connections:0,
   b2_gets:0,d1_writes:0,usdc_spent:0,
 };
}
if(import.meta.main){
 try{
  const report=JSON.parse(readFileSync(SOURCE,"utf8"));
  const result=auditPpgSourceOnlyCensus(report,TARGET);
  writeFileSync(OUTPUT,JSON.stringify(result,null,2)+"\n");
  console.log(JSON.stringify(result));
  assert(result.source_only_target_reached,"PPG_SOURCE_CENSUS_100_COUNTRY_TARGET_NOT_REACHED");
  console.log("PASS: WORLD BANK PPG SUPABASE-FREE SOURCE-ONLY COUNTRY CENSUS - NO PRODUCTION CHANGES");
 }catch(e){
  console.error(e instanceof Error?e.message:"PPG_SOURCE_CENSUS_UNKNOWN_FAILURE");
  process.exitCode=2;
 }
}
