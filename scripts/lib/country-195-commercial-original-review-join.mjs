/**
 * 195x3 commercial source-evidence accounting, NEVER a claim of 585 paid cells.
 *
 * Reuses the actual bounded, first-party 195 source-probe rollup AND the
 * existing Ed25519 same-event + rights verifier, instead of trusting
 * manually-entered true flags in a metadata spreadsheet or news feed.
 *
 * This is a PRE-PUBLICATION verifier. Per-country production B2/D1 signed
 * delivery must be attested and read back by a separate downstream gate.
 */
import {parseCanonical195Codes} from "./country-195-proof-rollup.mjs";
import {auditTrustedCountryEventEvidence} from "./trusted-country-event-evidence-census.mjs";
import {readFileSync} from "node:fs";

export const DOMAINS=Object.freeze(["geopolitics","macro","rare_earth"]);
const goodStatus=new Set([
 "UNPROBED","PROOF_OLDER_THAN_24H","SOURCE_TRANSPORT_UNVERIFIED",
 "COUNTRY_RELEVANCE_UNVERIFIED","ORIGINAL_PAGE_UNVERIFIED",
 "CURRENT_ORIGINAL_PROOF_VERIFIED",
]);
const fail=code=>{throw Error("COUNTRY_195_COMMERCIAL_EVIDENCE_"+code)};
const MAX_AGE_MS=20*60_000;
const ISO=/^[A-Z]{3}$/u;
const total=(rows,key)=>rows.filter(x=>x[key]===true).length;
const fresh=(str,now,max)=>{const n=Date.parse(str??"");return Number.isFinite(n)&&
 n<=now+60_000&&now-n<=max;};

/**
 * Inputs may come ONLY from the actual original-probe and signed-review
 * verification functions. An arbitrary claimed "signed:true" JSON input
 * cannot bypass the real Ed25519/native-original/rights verifier.
 */
export function reconcileCountry195OriginalWithSignedReview({
 rolling,canonicalCountrySource=readFileSync(
  "src/lib/canonical-country-registry-195.ts","utf8"),
 signedReviewRows=[],signedEventPackages=[],trustedReviewerPublicKeyPem,
 now=new Date(),
}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
   !Array.isArray(signedReviewRows)||!Array.isArray(signedEventPackages)||
   signedReviewRows.length!==signedEventPackages.length)
   fail("CLOCK_OR_SIGNED_REVIEW_INPUT_INVALID");
 const countryCodes=parseCanonical195Codes(canonicalCountrySource);
 const countries=new Set(countryCodes),timestamp=now.getTime();
 if(rolling?.schema!=="geomacro.country-195-live-original-proof-rollup.v1"||
    rolling.total_expected_cells!==585||
    !Array.isArray(rolling.cells)||rolling.cells.length!==585||
    rolling.b2_requests!==0||rolling.supabase_requests!==0||rolling.payments!==0||
    !fresh(rolling.as_of,timestamp,MAX_AGE_MS)||
    rolling.unprobed_cells!==585-rolling.cells_probed||
    !Number.isSafeInteger(rolling.cells_probed)||
    rolling.cells_probed<0||rolling.cells_probed>585)
   fail("ORIGINAL_ROLLUP_UNTRUSTED");
 // Revalidate the independent same-event + verified rights Ed25519
 // qualifier on the actual private source/event packages. Never accept a
 // precomputed "reviewed:true" or D1 source metadata as the trusted input.
 const reviewed=auditTrustedCountryEventEvidence({
  rows:signedReviewRows,eventPackages:signedEventPackages,now,
  trustedReviewerPublicKeyPem,
 });
 if(reviewed.schema!=="geomacro.private-country-domain-independent-evidence-census.v1"||
    reviewed.signed_current_gro_and_full_b2_d1_verified!==false||
    reviewed.real_time_195x3_commercial_intelligence_verified!==false||
    reviewed.x402_charge_authorized!==false||
    !Array.isArray(reviewed.country_domain_cells)||
    reviewed.country_domain_cells.length!==750)
   fail("SIGNED_REVIEW_TRUST_BOUNDARY");
 const verifiedReview=new Map();
 for(const item of reviewed.country_domain_cells){
   if(!ISO.test(item.iso3??"")||!DOMAINS.includes(item.domain)||
      !Number.isSafeInteger(item.signed_reviewed_event_count)||
      item.signed_reviewed_event_count<0||
      item.signed_current_gro_b2_d1_verified!==false||
      item.x402_payable!==false)
      fail("PRIVATE_REVIEW_CENSUS_INVALID");
   const key=item.iso3+":"+item.domain;
   if(verifiedReview.has(key))fail("DUPLICATE_PRIVATE_REVIEW_CELL");
   verifiedReview.set(key,item);
 }
 const probed=new Map();
 for(const cell of rolling.cells){
  const key=cell?.iso3+":"+cell?.category;
  if(!countries.has(cell?.iso3)||!DOMAINS.includes(cell?.category)||
     probed.has(key)||!goodStatus.has(cell.status)||
     typeof cell.current_original_proof_verified!=="boolean"||
     cell.current_original_proof_verified!==
       (cell.status==="CURRENT_ORIGINAL_PROOF_VERIFIED")||
     cell.current_original_proof_verified&&
       !fresh(cell.last_probe_at,timestamp,24*60*60_000))
     fail("ORIGINAL_PROOF_CELL_UNTRUSTED");
  probed.set(key,cell);
 }
 if(probed.size!==585)fail("NOT_ALL_585_CELLS_ACCOUNTED");
 const cells=[],categories=Object.fromEntries(DOMAINS.map(d=>[d,{
   total:195,current_first_party_original_cells:0,
   genuine_signed_review_and_rights_cells:0,
   both_probe_and_independent_review_cells:0,
   commercial_signed_delivery_cells:0,
   missing_either_verified_original_or_independent_review:0,
 }]));
 for(const iso3 of countryCodes)for(const category of DOMAINS){
  const key=iso3+":"+category,source=probed.get(key);
  const original=source.current_original_proof_verified;
  const reviewedRow=verifiedReview.get(key);
  if(!reviewedRow)fail("MISSING_SIGNED_REVIEW_COUNTRY_SCOPE");
  const reviewedCount=reviewedRow.signed_reviewed_event_count;
  const reviewedOriginal=reviewedCount>0;
  const combined=original&&reviewedOriginal;
  const state=original?
   reviewedOriginal?"INDEPENDENT_REVIEW_ACCEPTED_SIGNED_DELIVERY_NOT_VERIFIED":
    "ORIGINAL_READBACK_ACCEPTED_INDEPENDENT_REVIEW_REQUIRED":
   reviewedOriginal?"INDEPENDENT_REVIEW_EXISTS_CURRENT_SOURCE_PROBE_UNVERIFIED":
    source.status==="UNPROBED"?"COUNTRY_NOT_PROBED":
    "CURRENT_ORIGINAL_AND_INDEPENDENT_REVIEW_NOT_ESTABLISHED";
  const c=categories[category];
  if(original)c.current_first_party_original_cells++;
  if(reviewedOriginal)c.genuine_signed_review_and_rights_cells++;
  if(combined)c.both_probe_and_independent_review_cells++;
  if(!combined)c.missing_either_verified_original_or_independent_review++;
  cells.push({iso3,category,status:state,
   current_original_probe_verified:original,
   genuine_independent_signed_event_review_verified:reviewedOriginal,
   qualifying_signed_review_event_count:reviewedCount,
   both_prepublication_gates_met:combined,
   signed_commercial_product_readback_verified:false,
   charge_authorized:false,
  });
 }
 if(cells.length!==585||new Set(cells.map(c=>c.iso3+":"+c.category)).size!==585||
    Object.values(categories).some(c=>c.total!==195||
    c.both_probe_and_independent_review_cells+
      c.missing_either_verified_original_or_independent_review!==195))
    fail("INCOMPLETE_COUNTRY_CATEGORY_GRID");
 return Object.freeze({
  schema:"geomacro.country-195x3-original-independent-review-readiness.v1",
  observed_at:now.toISOString(),
  exact_canonical_country_count:195,category_count:3,
  exact_cells_evaluated:585,domains:categories,
  original_source_probe_cells:total(cells,"current_original_probe_verified"),
  genuinely_independent_signed_review_cells:total(cells,"genuine_independent_signed_event_review_verified"),
  both_prepublication_gates_verified:total(cells,"both_prepublication_gates_met"),
  // NEVER make a paid status assertion from a source and reviewer alone.
  signed_commercial_delivery_cells_verified:0,
  independent_B2_D1_product_readback_per_country_verified:false,
  entire_195x3_commercial_live_coverage_verified:false,
  cannot_upgrade_original_source_to_commercial_licence_without_signed_rights:true,
  missing_country_category_cells:cells.filter(c=>!c.both_prepublication_gates_met)
    .map(({iso3,category,status})=>({iso3,category,status})),
  per_country_category:cells,
  input_signed_reviewer_event_count:reviewed.trusted_ed25519_signed_review_count,
  zero_signed_review_rows_means_no_signed_review_not_no_risk:true,
  x402_charge_authorized:false,paid_delivery_enabled:false,
  raw_articles_or_original_urls_present:false,
  b2_requests:0,d1_writes:0,supabase_requests:0,payments:0,
 });
}
