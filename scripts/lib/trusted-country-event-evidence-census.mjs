/**
 * #1827 Private per-ISO3 independent event-review evidence census.
 *
 * Distinct from the D1 source-directory / source-metadata census.
 * A country/domain is reviewed ONLY after the EXISTING, trusted Ed25519
 * reviewer / same-event / original-native-time / per-source-rights gate.
 * Even reviewed evidence is NOT proof of a signed current GRO/B2/D1 serving
 * receipt or paid delivery. Synthetic fixtures are never production evidence.
 */
import { readFileSync } from "node:fs";
import { qualifyIndependentSameEvent } from "./independent-same-event-qualification.mjs";
import { canonicalGeographicDenominator } from "../ops/audit-free-three-domain-country-gaps.mjs";

const DOMAINS=Object.freeze(["geopolitics","macro","rare_earth"]);
const MAX_EVENTS=80;

const canonicalIso3=()=>{
  const source=readFileSync(new URL("../../src/lib/global-entity-classification.ts",
    import.meta.url),"utf8");
  return canonicalGeographicDenominator(source);
};
const err=code=>{throw Error("COUNTRY_EVENT_EVIDENCE_"+code)};
export function auditTrustedCountryEventEvidence({
  rows=[],eventPackages=[],now=new Date(),trustedReviewerPublicKeyPem,
}={}){
  if(!Array.isArray(rows)||!Array.isArray(eventPackages)||
     rows.length!==eventPackages.length||rows.length>MAX_EVENTS||
     !(now instanceof Date)||!Number.isFinite(now.getTime()))
    err("INPUT_INVALID");
  const canonical=canonicalIso3();
  // The only positive path calls the actual signed commercial pre-publication
  // qualifier. A JSON "verified":true on a user-supplied receipt is NEVER
  // accepted as independent proof.
  const checked=rows.length>0?qualifyIndependentSameEvent({
    rows,eventPackages,now,trustedReviewerPublicKeyPem,
  }):null;
  const admitted=checked?.receipt.qualified??[];
  if(admitted.length!==rows.length)err("QUALIFIED_COUNT_INVALID");
  const perPair=new Map();
  const perDomain=Object.fromEntries(DOMAINS.map(domain=>[domain,{
    independently_reviewed_event_count:0,
    country_domain_pairs_with_reviewed_events:0,
    without_current_independent_review:canonical.size,
    current_signed_gro_country_domain_pairs:0,
  }]));
  for(const event of admitted){
    if(!canonical.has(event.country_iso3)||!DOMAINS.includes(event.category)||
       event.independent_reporting_organizations<2||
       event.trusted_ed25519_review_signature_verified!==true||
       event.same_event_structured_identity_verified!==true||
       event.source_native_freshness_verified!==true||
       event.review_and_derived_use_rights_receipts_present!==true||
       event.counterevidence_review_signed!==true||
       event.unresolved_material_conflicts!==0||
       !/^[a-f0-9]{64}$/u.test(event.event_claim_sha256))
      err("SIGNED_EVIDENCE_INCONSISTENT");
    const key=event.country_iso3+":"+event.category;
    const old=perPair.get(key)??[];
    old.push({
      event_claim_sha256:event.event_claim_sha256,
      last_independent_original_at:event.latest_independent_original_at,
    });
    perPair.set(key,old);
    perDomain[event.category].independently_reviewed_event_count++;
  }
  const cells=[];
  for(const [iso3,scope] of [...canonical].sort((a,b)=>a[0].localeCompare(b[0]))){
    for(const domain of DOMAINS){
      const evidence=perPair.get(iso3+":"+domain)??[];
      const signed=evidence.length>0;
      cells.push({
        iso3,scope,domain,
        private_independent_same_event_review_status:
          signed?"SIGNED_REVIEW_ACCEPTED_NOT_HOT_SERVING":"NO_CURRENT_SIGNED_INDEPENDENT_EVENT",
        signed_reviewed_event_count:evidence.length,
        // Claims are hashes of same-event identities, not raw source content.
        independently_reviewed_event_claim_hashes:evidence.map(e=>e.event_claim_sha256),
        original_native_time_of_last_independent_confirmation:
          signed?evidence.map(e=>e.last_independent_original_at).sort().at(-1):null,
        // Do not promote event-review presence into current country GRO state.
        signed_current_gro_b2_d1_verified:false,
        x402_payable:false,
      });
    }
  }
  for(const domain of DOMAINS){
    const reviewCount=cells.filter(c=>c.domain===domain&&c.signed_reviewed_event_count>0).length;
    perDomain[domain].country_domain_pairs_with_reviewed_events=reviewCount;
    perDomain[domain].without_current_independent_review=canonical.size-reviewCount;
  }
  return {
    schema:"geomacro.private-country-domain-independent-evidence-census.v1",
    observed_at:now.toISOString(),
    canonical_sovereign_count:[...canonical.values()].filter(x=>x==="SOVEREIGN").length,
    canonical_geographic_entity_count:canonical.size,
    required_domains:DOMAINS,
    target_geography_domain_cells:canonical.size*DOMAINS.length,
    trusted_ed25519_signed_review_count:admitted.length,
    signed_review_receipt_sha256:checked?.receipt_sha256??null,
    domains:perDomain,
    country_domain_cells:cells,
    independent_same_event_checks_executed:rows.length>0,
    no_current_event_is_not_zero_risk:true,
    original_publisher_raw_urls_or_text_emitted:false,
    no_fake_source_or_rights_grants:true,
    // Crucial: a signed editorial review remains an input to the separate
    // trusted GRO+B2 full readback+D1 serving proof, NOT paid acceptance.
    signed_current_gro_and_full_b2_d1_verified:false,
    real_time_195x3_commercial_intelligence_verified:false,
    x402_charge_authorized:false,
    payment_performed:false,
    b2_reads:0,b2_writes:0,d1_reads:0,d1_writes:0,
    supabase_reads:0,supabase_writes:0,
  };
}
