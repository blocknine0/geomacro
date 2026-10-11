import { createHash } from "node:crypto";
import type { CountryRiskEventInput } from "./country-risk-engine";
import type { B2CommercialSourceRight } from "./b2-live.server";
import { readB2CommercialSourceRights } from "./b2-live.server";
import { commercialSourceEligibilityFromRow } from "./commercial-source-eligibility.server";
import { canonicalRiskObjectJson } from "./risk-object-signing.server";
import type {
  VerifiedOnDemandCategory, VerifiedOnDemandEvidenceReceipt,
} from "./on-demand-qualified-country-risk.server";
// This is the EXISTING authority for independently reviewed same-event claims,
// originating-organization registration, private reviewer signatures and clocks.
// A duplicate permissive same-event heuristic would weaken its trust boundary.
// @ts-expect-error Repository's canonical independent reviewer is an MJS module.
import { qualifyIndependentSameEvent } from "../../scripts/lib/independent-same-event-qualification.mjs";

type ReviewedCustomerRow = {
  id:string;
  category:VerifiedOnDemandCategory;
  source_title:string;
  severity:number;
  [key:string]:unknown;
};
type ReviewedOriginalEvidence = {
  publisher_organization_id:string;
  originating_reporting_organization_id:string;
  original_article_sha256:string;
  original_published_at:string;
  source_registry_id?:string;
};
type ReviewedEventPackage = {
  event_id:string;
  category:VerifiedOnDemandCategory;
  event:{
    country_iso3:string;
    event_type:string;
    occurred_at:string;
  };
  reviewed_scoring_event_sha256?:string;
  evidence:ReviewedOriginalEvidence[];
  [key:string]:unknown;
};

export type TrustedReviewBundle = Readonly<{
  rows:ReadonlyArray<ReviewedCustomerRow>;
  eventPackages:ReadonlyArray<ReviewedEventPackage>;
}>;

/** The publisher organization and its rights row must be pinned together;
 * a caller-controlled source_id must not borrow another agency's licence. */
const ACCEPTED_SOURCE_IDS:Readonly<Record<string,readonly string[]>>={
  un_news:["un_news","un_news_security_original_rss_review"],
  uk_fcdo:["uk_fcdo","uk_fcdo_original_foreign_policy_atom_review"],
  un_geneva:["un_geneva"],
  federal_reserve:["federal_reserve","fed_monetary_original_press_rss_review"],
  ecb:["ecb"],
  usgs:["usgs","usgs_minerals_original_news_rss_review"],
  statistics_canada:["statistics_canada","statcan_prices_original_atom_review"],
  natural_resources_canada:["natural_resources_canada","nrcan_government_news_original_atom_review"],
};

const HASH=/^[0-9a-f]{64}$/;
const hash=(value:unknown)=>createHash("sha256")
  .update(canonicalRiskObjectJson(value),"utf8").digest("hex");
const sorted=(values:readonly string[])=>[...values].sort();

function matchingEvidence(
  event:CountryRiskEventInput,
  row:ReviewedCustomerRow,
  pkg:ReviewedEventPackage,
): boolean {
  const originals=pkg.evidence;
  if (!Array.isArray(originals) || originals.length<2 ||
      !HASH.test(pkg.reviewed_scoring_event_sha256??"") ||
      pkg.reviewed_scoring_event_sha256!==hash(event) ||
      event.id!==row.id || event.id!==pkg.event_id ||
      event.domain!==pkg.category || event.domain!==row.category ||
      event.event_type!==pkg.event.event_type ||
      event.primary_country!==pkg.event.country_iso3 ||
      event.title!==row.source_title || event.severity!==row.severity ||
      Date.parse(String(event.material_evidence_at??""))!==Date.parse(pkg.event.occurred_at) ||
      Date.parse(event.first_seen_at)!==Date.parse(pkg.event.occurred_at) ||
      Date.parse(event.last_seen_at)!==Math.max(...originals.map(x=>
        Date.parse(x.original_published_at))) ||
      event.corroboration_status!=="CONFIRMED" ||
      event.independent_source_count!==new Set(originals.map(x=>
        x.originating_reporting_organization_id)).size ||
      event.evidence_count!==originals.length)
    return false;

  const ids:string[]=[];
  const organizations:string[]=[];
  const articleHashes:string[]=[];
  for(const original of originals){
    const id=original.source_registry_id;
    const org=original.originating_reporting_organization_id;
    if(typeof id!=="string" || !ACCEPTED_SOURCE_IDS[org]?.includes(id) ||
       original.publisher_organization_id!==org ||
       !HASH.test(original.original_article_sha256))return false;
    ids.push(id);
    organizations.push(org);
    articleHashes.push(original.original_article_sha256);
  }
  return new Set(organizations).size>=2 &&
    JSON.stringify(sorted(event.source_ids??[]))===JSON.stringify(sorted(ids)) &&
    JSON.stringify(sorted(event.source_families??[]))===JSON.stringify(sorted(organizations)) &&
    JSON.stringify(sorted(event.source_record_ids??[]))===JSON.stringify(sorted(articleHashes)) &&
    JSON.stringify(sorted(event.content_hashes??[]))===JSON.stringify(sorted(articleHashes));
}

function strictRegistryStatus(
  rows:ReadonlyArray<B2CommercialSourceRight>,
  pkg:ReviewedEventPackage,
):"DERIVED_ONLY"|null {
  let status:"DERIVED_ONLY"|"VERIFIED"="VERIFIED";
  const used=new Set<string>();
  for(const original of pkg.evidence){
    const id=original.source_registry_id!;
    if(used.has(id))return null;
    used.add(id);
    const matching=rows.filter(x=>x.source_id===id);
    if(matching.length!==1)return null;
    const rights=commercialSourceEligibilityFromRow(id,matching[0]);
    // Until publisher attribution is correctly included in the exact signed
    // customer contract, claiming commercial readiness would violate terms.
    if(!rights.eligible || rights.delivery_boundary!=="DERIVED_ONLY" ||
       rights.raw_payload_allowed!==false ||
       rights.attribution_required || !rights.licence_name?.trim())
      return null;
    if(matching[0].category && matching[0].category!==pkg.category)return null;
    if(rights.commercial_usage_status==="DERIVED_ONLY")status="DERIVED_ONLY";
  }
  // The customer contract always delivers derived-only intelligence, never
  // upstream articles, regardless of underlying public-domain permissions.
  return status==="VERIFIED"?"DERIVED_ONLY":status;
}

/**
 * Real internal qualifier adapter for previously authorized reviewer-signed
 * originals. No source fetch, signing key, B2 write, Supabase, D1 or settlement.
 * It relies on one fresh existing B2 rights registry read and the existing
 * signature/claim/counterevidence reviewer, not unreviewed RSS titles.
 *
 * No public request may provide this bundle or the independent review key.
 * Without production reviewer approval and complete licensed source rows,
 * the function returns null; the caller MUST NOT sign or take payment.
 */
export function createReviewedRightsOnDemandQualifier(
  trustedPrivateBundle:TrustedReviewBundle,
  options:{readRights?:()=>Promise<B2CommercialSourceRight[]|null>}={},
){
  return async(input:Readonly<{
    category:VerifiedOnDemandCategory;
    country_iso3:string;
    evidence_sha256:string;
    events:ReadonlyArray<CountryRiskEventInput>;
    now:Date;
  }>):Promise<VerifiedOnDemandEvidenceReceipt|null>=>{
    const pem=process.env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM;
    if(typeof pem!=="string"||!pem.includes("BEGIN PUBLIC KEY") ||
       !Array.isArray(trustedPrivateBundle?.rows) ||
       !Array.isArray(trustedPrivateBundle?.eventPackages) ||
       trustedPrivateBundle.rows.length!==input.events.length ||
       trustedPrivateBundle.eventPackages.length!==input.events.length ||
       input.events.length===0 || input.events.length>12 ||
       !HASH.test(input.evidence_sha256) ||
       hash(input.events)!==input.evidence_sha256)return null;
    const eventIds=sorted(input.events.map(x=>x.id));
    if(new Set(eventIds).size!==eventIds.length)return null;
    const rows=trustedPrivateBundle.rows;
    const packages=trustedPrivateBundle.eventPackages;
    for(let i=0;i<input.events.length;i++){
      const event=input.events[i],row=rows[i],pkg=packages[i];
      if(!event||!row||!pkg||event.domain!==input.category ||
         pkg.category!==input.category ||
         pkg.event.country_iso3!==input.country_iso3 ||
         !matchingEvidence(event,row,pkg))return null;
    }

    let review:ReturnType<typeof qualifyIndependentSameEvent>;
    try{
      review=qualifyIndependentSameEvent({
        rows,eventPackages:packages,now:input.now,
        trustedReviewerPublicKeyPem:pem,
      });
    }catch{return null;}
    if(review.receipt?.commercial_event_admission!==true ||
       review.receipt?.qualified_event_count!==input.events.length ||
       !Array.isArray(review.receipt.qualified) ||
       review.receipt.qualified.some((x:{event_id:string;country_iso3:string;
         trusted_ed25519_review_signature_verified:boolean})=>
         !eventIds.includes(x.event_id) || x.country_iso3!==input.country_iso3 ||
         x.trusted_ed25519_review_signature_verified!==true))return null;

    let rightsRows:B2CommercialSourceRight[]|null;
    try{rightsRows=await (options.readRights??readB2CommercialSourceRights)();}
    catch{return null;}
    if(!Array.isArray(rightsRows))return null;
    const event_commercial_eligibility=[];
    for(const pkg of packages){
      const status=strictRegistryStatus(rightsRows,pkg);
      if(!status)return null;
      event_commercial_eligibility.push({
        event_id:pkg.event_id,status,reason_codes:[
          "independent_review_signed",
          "exact_scoring_input_sha256_bound",
          "b2_certified_derived_only_no_raw_redistribution",
        ],
      });
    }
    return {
      schema:"geomacro.on-demand-qualified-events.v1",
      category:input.category,country_iso3:input.country_iso3,
      exact_evidence_sha256:input.evidence_sha256,
      event_ids:eventIds,
      independent_claims_verified:true,
      verified_commercial_rights:true,
      event_commercial_eligibility,
    };
  };
}
