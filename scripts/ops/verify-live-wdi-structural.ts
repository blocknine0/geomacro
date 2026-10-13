#!/usr/bin/env bun
/** Production-compatible no-funds proof: one genuine HTTPS WDI API source=2
 * observation read through the EXISTING on-demand World Bank adapter.
 * This does NOT infer commercial rights or source publication timing from
 * a successful transport request. No B2, Supabase, settlement or x402 calls. */
import { createHash } from "node:crypto";
import { mkdirSync,writeFileSync } from "node:fs";
import { readPinnedWdiAnnualStructuralPair } from "../../src/lib/on-demand-global-discovery.server";
const checked_at=new Date().toISOString();
const report:Record<string,unknown>={
  schema:"geomacro.phase2-step4-real-wdi-no-funds.v1",
  checked_at, country_iso3:"CHN",indicator:"FP.CPI.TOTL.ZG",
  expected_api_source_id:"2",publisher_original_indicator_release_at:null,
  commercial_rights_receipt_verified:false,
  advertised_signature:false,actual_settlements:0,x402_requests:0,
};
try {
  const r=await readPinnedWdiAnnualStructuralPair("CHN","FP.CPI.TOTL.ZG");
  const p=r.pair;
  report.source_api_id=r.source_api_id;
  report.status=r.status;
  report.last_dataset_updated_at=r.lastupdated;
  report.latest_reference_year=p?.latest_observation_year??null;
  report.previous_reference_year=p?.previous_observation_year??null;
  report.latest_annual_percent=p?.latest_annual_pct??null;
  report.previous_annual_percent=p?.previous_annual_pct??null;
  report.change_percentage_points=p?.annual_rate_change_percentage_points??null;
  report.observation_fingerprint_sha256=p?.source_observation_sha256??null;
  report.source2_facts_verified=r.source_api_id==="2" && Boolean(p) &&
    typeof r.lastupdated==="string" && p?.latest_observation_year===p?.previous_observation_year+1;
} catch(e) {
  report.source2_facts_verified=false;
  report.error=e instanceof Error?e.message:"OFFICIAL_WDI_FETCH_UNAVAILABLE";
}
mkdirSync("artifacts/on-demand-live",{recursive:true});
writeFileSync("artifacts/on-demand-live/step4-real-wdi-no-funds.json",
  JSON.stringify(report,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify(report));
if(!report.source2_facts_verified)process.exitCode=3;
