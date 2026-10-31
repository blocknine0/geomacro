import type {QualifiedPrivateEvidence} from "./on-demand-evidence-qualification.server";

/**
 * Fixed, curated independent-official-source *review lanes*, not verified
 * factual claims. No two independent URLs, releases or matching dates prove
 * a common event. Reviewer must bind original bytes, identical claim,
 * counterevidence and item-level derived-use permissions separately.
 */
export const ON_DEMAND_OFFICIAL_PAIR_LANES=Object.freeze([
  {category:"macro",first:"us_bls",second:"us_federal_reserve"},
  {category:"macro",first:"india_rbi",second:"india_ministry_finance"},
  {category:"rare_earth",first:"usgs",second:"bgs"},
  {category:"rare_earth",first:"indonesia_esdm",second:"indonesia_official_gazette"},
  {category:"geopolitics",first:"un_reliefweb",second:"gdacs"},
] as const);
type Category="geopolitics"|"macro"|"rare_earth";
type Original=QualifiedPrivateEvidence["originals"][number];
const FAMILY:Readonly<Record<string,string>>=Object.freeze({
  us_bls_original_publisher:"us_bls",
  us_bls_original_release:"us_bls",
  us_federal_reserve_original_publisher:"us_federal_reserve",
  us_federal_reserve_original_page:"us_federal_reserve",
  rbi_original_press_release:"india_rbi",
  india_mof_original_publisher:"india_ministry_finance",
  usgs_original_publisher:"usgs",
  usgs_mcs_original_publisher:"usgs",
  bgs_original_publisher:"bgs",
  bgs_world_mineral_statistics:"bgs",
  indonesia_esdm_original_publisher:"indonesia_esdm",
  indonesia_official_gazette_original_publisher:"indonesia_official_gazette",
  reliefweb_original_publisher:"un_reliefweb",
  un_reliefweb_original_publisher:"un_reliefweb",
  gdacs_original_publisher:"gdacs",
});
export type ReviewPair=Readonly<{
  category:Category;country_iso3:string;
  first_original_sha256:string;second_original_sha256:string;
  source_families:readonly [string,string];
  verification:"ORIGINALS_IDENTIFIED_SAME_EVENT_NOT_YET_VERIFIED";
  item_commercial_rights_verified:false;qualified_for_payment:false;
}>;
const SHA=/^[a-f0-9]{64}$/u;
export function pairOnDemandOriginalsForIndependentReview(input:QualifiedPrivateEvidence):readonly ReviewPair[]{
  if(input.schema!=="geomacro.on-demand-private-evidence-qualification.v1"||
    !/^[A-Z]{3}$/u.test(input.country_iso3)||
    !Array.isArray(input.originals)||input.originals.length>16)
    throw Error("ON_DEMAND_PAIR_PRIVATE_EVIDENCE_INVALID");
  const out:ReviewPair[]=[];
  const originals=input.originals.filter(x=>
    x.subject_country_iso3===input.country_iso3 &&
    SHA.test(x.article_identity_sha256) &&
    ["VERIFIED_ORIGINAL_PAGE","VERIFIED_NATIVE_FEED"].includes(x.original_clock_basis) &&
    Number.isFinite(Date.parse(x.original_published_at)) &&
    x.independent_same_event_verified===false &&
    x.article_commercial_rights_verified===false);
  for(const lane of ON_DEMAND_OFFICIAL_PAIR_LANES){
    const first=originals.filter(x=>x.category===lane.category&&FAMILY[x.source_family]===lane.first);
    const second=originals.filter(x=>x.category===lane.category&&FAMILY[x.source_family]===lane.second);
    for(const a of first)for(const b of second){
      const span=Math.abs(Date.parse(a.original_published_at)-Date.parse(b.original_published_at));
      if(span>24*3600_000 || a.article_identity_sha256===b.article_identity_sha256)continue;
      // Strictly a candidate for private independent semantic review.
      // The timestamps only bound the reviewer queue, never establish a match.
      out.push(Object.freeze({
        category:lane.category as Category,country_iso3:input.country_iso3,
        first_original_sha256:a.article_identity_sha256,
        second_original_sha256:b.article_identity_sha256,
        source_families:[a.source_family,b.source_family] as const,
        verification:"ORIGINALS_IDENTIFIED_SAME_EVENT_NOT_YET_VERIFIED" as const,
        item_commercial_rights_verified:false as const,qualified_for_payment:false as const,
      }));
    }
  }
  return Object.freeze(out.slice(0,12));
}

/** Private-only, non-promoting statistics suitable for an uncharged API. */
export function publicOnDemandReviewPairCount(pairs:readonly ReviewPair[]){
  return {independent_official_pair_candidates_for_review:pairs.length,
    independent_same_event_claims_verified:0,
    item_commercial_rights_verified:0,
    payment_eligible:false} as const;
}
