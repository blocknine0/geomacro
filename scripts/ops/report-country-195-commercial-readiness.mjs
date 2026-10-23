#!/usr/bin/env node
/**
 * Reconcile the daily 195-country bounded original-probe rollup against
 * independent commercial review. The scheduled job has NO private signed
 * reviewer package: it must NOT turn absent private input into a false
 * statement that the reviewer rejected the underlying world events.
 *
 * Private review can be separately run using the existing
 * audit-trusted-country-event-evidence.mjs; this public scheduled report is
 * a PRE-PUBLICATION gap census and never signs, publishes or charges.
 */
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {reconcileCountry195OriginalWithSignedReview}
 from "../lib/country-195-commercial-original-review-join.mjs";
export function computeCountry195UnverifiedCommercialCensus({
 read=readFileSync,now=new Date()
}={}){
 const rolling=JSON.parse(read("artifacts/country-195/rolling-proof-summary.v1.json","utf8"));
 const r=reconcileCountry195OriginalWithSignedReview({rolling,now});
 return {
  ...r,
  private_independent_reviewer_material_supplied_in_this_census:false,
  absent_private_review_is_not_proof_no_commercial_rights_exist:true,
  full_world_on_demand_routing_does_not_guarantee_new_events_every_24h:true,
  // This one census never reads B2, D1 private source, signatures or payment.
  downstream_signed_commercial_3of3_live_acceptance_checked:false,
 };
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===
    new URL("file://"+resolve(process.argv[1])).href){
 try{
  if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
     process.env.GITHUB_REF!=="refs/heads/main"||
     !/^\d{1,20}$/u.test(process.env.GITHUB_RUN_ID??""))
     throw Error("COUNTRY_195_PROTECTED_MAIN_REQUIRED");
  const receipt=computeCountry195UnverifiedCommercialCensus();
  mkdirSync("artifacts/country-195",{recursive:true,mode:0o700});
  writeFileSync("artifacts/country-195/commercial-original-review-gaps.v1.json",
   JSON.stringify(receipt,null,2)+"\n",{mode:0o600,flag:"w"});
  console.log(JSON.stringify({
   schema:receipt.schema,examined:receipt.exact_cells_evaluated,
   domains:receipt.domains,
   original_source_probe_cells:receipt.original_source_probe_cells,
   independent_signed_reviews_assessed_in_this_job:false,
   signed_product_585_cell_verification:false,
   external_rights_not_automatically_granted:true,
   paid_delivery_enabled:false,source_fetches:0,payments:0,
  }));
 }catch{
  console.error("::error::COUNTRY_195_COMMERCIAL_SOURCE_CERTIFICATION_NOT_PROVEN");
  process.exitCode=3;
 }
}
