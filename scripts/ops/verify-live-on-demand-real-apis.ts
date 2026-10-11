#!/usr/bin/env bun
/**
 * Real (not mocked) read-only global API evidence acceptance.
 * Does not create a source right, signed GRO, a public intelligence object,
 * a B2 archive, D1 checkpoint, a USDC payment or an x402 settlement.
 * One ISO3 country x three Geomacro categories, 8 fixed upstream requests.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { discoverOnDemandForPrivateQualification } from "../../src/lib/on-demand-global-discovery.server";

const privateEvidence=await discoverOnDemandForPrivateQualification({
  country_iso3:"IND",
  categories:["geopolitics","macro","rare_earth"],
});
const receipt=privateEvidence.discovery;
const proof={
  schema:"geomacro.live-on-demand-real-api-safety.v1",
  checked_at:receipt.checked_at,
  sample_country_iso3:receipt.country_iso3,
  category_count:receipt.categories.length,
  categories:receipt.categories,
  network_attempts:receipt.network_attempts,
  parallel:receipt.searched_in_parallel,
  status:receipt.status,
  distinct_provider_families_reached:receipt.reached_source_families,
  providers:receipt.source_probes.map(row=>({
    family:row.family,
    reachable:row.reachable,
    discovered_records:row.observed_record_count,
    publisher_original_publication_clock_verified:row.publication_clock_verified,
    independent_claim_verified:row.independent_claim_verified,
    commercial_rights_verified:row.derived_commercial_rights_verified,
  })),
  private_original_candidate_count:privateEvidence.private_candidates.length,
  private_original_candidate_page_dates_verified:false,
  private_original_candidate_derived_rights_verified:false,
  published_signed_intelligence:receipt.signed_derived_intelligence_created,
  independently_corrobated_same_event:receipt.independent_same_event_corroboration_verified,
  commercially_licensed:receipt.source_derived_commercial_rights_verified,
  payable:receipt.payable,
  raw_upstream_delivered:receipt.raw_upstream_delivered,
  payment_settlement_attempted:receipt.settlement_attempted,
  supabase_requests:receipt.supabase_requests,
  b2_requests:receipt.b2_requests,
};
mkdirSync("artifacts/on-demand-live",{recursive:true});
writeFileSync("artifacts/on-demand-live/real-api-proof.json",
  JSON.stringify(proof,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify(proof));
if(proof.category_count!==3||proof.network_attempts>12 ||
   proof.private_original_candidate_count>16 ||
   proof.network_attempts<1||proof.payable!==false||
   proof.raw_upstream_delivered!==false||
   proof.payment_settlement_attempted!==false||
   proof.supabase_requests!==0||proof.b2_requests!==0)
  process.exitCode=2;
else if(proof.distinct_provider_families_reached===0)
  process.exitCode=3; // zero genuine external sources; NOT false GREEN
