#!/usr/bin/env bun
/**
 * No-secrets, no-storage, GET/remote-read-only POST probe of fixed official APIs.
 * The POST is a USAspending public awards SEARCH, never a Geomacro purchase.
 * Print category counts only; never emit raw source bodies, names, record IDs.
 */
import { readCategoryOpenData } from "../../src/lib/category-open-data.server";

const domains = ["geopolitics","macro-fx","critical-minerals"] as const;
const results=await Promise.all(domains.map(async category=>{
  try{
    const result=await readCategoryOpenData(category);
    return {
      category, attempted:result.source_families_attempted,
      readable:result.source_families_readable,
      unavailable:result.source_families_unavailable,
      derived_observations:result.findings.length,
      status:result.status,
      valid:result.chargeable===false && result.signed_gro_generated===false &&
        result.x402_payment_required===false && result.persistent_storage_written===false &&
        result.source_event_and_period_clocks_distinct===true &&
        result.findings.every(x=>x.evidence_class==="official_open_data_unscored" &&
          x.score===null && x.independent_same_event_verification===false),
    };
  }catch{return {category,attempted:0,readable:0,unavailable:0,
    derived_observations:0,status:"READER_UNAVAILABLE",valid:false};}
}));
const report={
  schema:"geomacro.three-domain-open-data-readonly-canary.v1",
  checked_at:new Date().toISOString(),
  results,
  paid_or_signed_intelligence:false,
  all_sources_proven:false,
  payments:0,
  source_urls_logged:false,
  raw_upstream_payloads_logged:false,
  source_names_logged:false,
  any_persistent_storage:false,
  all_domains_have_readable_provider:results.every(x=>x.readable>=1&&x.valid),
};
console.log(JSON.stringify(report));
if(!report.all_domains_have_readable_provider)process.exitCode=2;
