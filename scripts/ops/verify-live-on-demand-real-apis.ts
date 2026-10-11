#!/usr/bin/env bun
/**
 * Real (not mocked) read-only global API evidence acceptance.
 * Does not create a source right, signed GRO, a public intelligence object,
 * a B2 archive, D1 checkpoint, a USDC payment or an x402 settlement.
 * Exact customer example: CHN lithium supply risk x the same three
 * Geomacro categories. Maximum 12 discovery plus 4 original page GETs.
 * No unbounded search, source-identity leak, funds or extra workflow.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { buildPrivateOnDemandMacroDrivers } from "../../src/lib/on-demand-private-macro-drivers.server";
import {
  discoverOnDemandForPrivateQualification,
  verifyOnDemandOriginalArticlePages,
} from "../../src/lib/on-demand-global-discovery.server";

const privateEvidence=await discoverOnDemandForPrivateQualification({
  country_iso3:"CHN",
  categories:["geopolitics","macro","rare_earth"],
  mineral:"lithium",
});
const receipt=privateEvidence.discovery;
const privateMacroDrivers=buildPrivateOnDemandMacroDrivers(privateEvidence.private_macro_changes);
// PRIVATE evidence continuation: only the aggregate count may enter logs or
// artifacts. Original publisher URLs, page HTML and articles remain private.
const pageProof=await verifyOnDemandOriginalArticlePages(
  privateEvidence.private_original_review_candidates);
const proof={
  schema:"geomacro.live-on-demand-real-api-safety.v1",
  checked_at:receipt.checked_at,
  sample_country_iso3:receipt.country_iso3,
  sample_topic_mineral:"lithium",
  sample_case:"CHN_LITHIUM_CURRENT_SUPPLY_RISK",
  category_count:receipt.categories.length,
  categories:receipt.categories,
  network_attempts:receipt.network_attempts,
  original_article_page_attempts:pageProof.attempted,
  total_bounded_network_attempts:receipt.network_attempts+pageProof.attempted,
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
  duplicate_original_headlines_suppressed:privateEvidence.duplicate_original_headline_count,
  private_official_annual_change_count:privateEvidence.private_macro_changes.length,
  private_annual_directional_macro_driver_count:privateMacroDrivers.length,
  private_original_candidate_page_dates_verified:
    privateEvidence.private_original_review_candidates.length>0 &&
    pageProof.verified===privateEvidence.private_original_review_candidates.length,
  original_article_page_publication_date_verified_count:pageProof.verified,
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
if(proof.sample_country_iso3!=="CHN" ||
   proof.sample_topic_mineral!=="lithium" ||
   proof.sample_case!=="CHN_LITHIUM_CURRENT_SUPPLY_RISK" ||
   proof.category_count!==3||proof.network_attempts>12 ||
   proof.original_article_page_attempts>4 ||
   proof.total_bounded_network_attempts>16 ||
   proof.original_article_page_publication_date_verified_count>
     proof.original_article_page_attempts ||
   proof.private_original_candidate_count>16 ||
   proof.duplicate_original_headlines_suppressed>16 ||
   proof.private_official_annual_change_count>2 ||
   proof.private_annual_directional_macro_driver_count>
     proof.private_official_annual_change_count ||
   proof.network_attempts<1||proof.payable!==false||
   proof.raw_upstream_delivered!==false||
   proof.payment_settlement_attempted!==false||
   proof.supabase_requests!==0||proof.b2_requests!==0)
  process.exitCode=2;
else if(proof.distinct_provider_families_reached===0)
  process.exitCode=3; // zero genuine external sources; NOT false GREEN
