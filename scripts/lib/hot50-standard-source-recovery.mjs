/**
 * Source-gap repair ordering for the exact 50x3 Standard commercial product.
 * This is metadata-only, NEVER an admission or sales certificate. The existing
 * provenance verifier, signed GRO publisher and payment settlement remain
 * the sole authorities for commercial eligibility.
 */
import {RISK_GATE_HOT50} from "../../workers/control-plane/src/risk-gate-hot50-scope.mjs";
import {hot50FourLaneSourceCrosswalk} from "./hot-50-four-lane-source-crosswalk.mjs";
import {isRetiredPrivateOsintSource} from "./private-osint-retired-sources.mjs";
const CATEGORIES=Object.freeze({
 GEOPOLITICS:"geopolitics",
 MACRO_FX:"macro",
 CRITICAL_MINERALS:"rare_earth",
});
const STATES=new Set(["INVALID_OR_MISSING","NO_VERIFIED_SIGNAL","OBSERVED_UNVERIFIED"]);
const hot=new Set(RISK_GATE_HOT50);
const classification=(state,n)=>{
 if(state==="INVALID_OR_MISSING")return ["P0_CONTRACT_OR_SIGNER","RESTORE_TRUSTED_TIER_CONTRACT"];
 if(n===0)return ["P0_NO_ORIGINAL_CANDIDATE","ONBOARD_TWO_INDEPENDENT_FIRST_PARTY_ORIGINALS"];
 if(n===1)return ["P1_SINGLE_ORIGINAL_CANDIDATE","FIND_SECOND_INDEPENDENT_ORIGINAL_ISSUER"];
 if(state==="OBSERVED_UNVERIFIED")
  return ["P2_OBSERVED_WITHOUT_SIGNED_PROOF","VERIFY_SOURCE_RIGHTS_SAME_EVENT_AND_SIGNED_GRO"];
 return ["P3_CANDIDATES_NOT_EVIDENCE","VERIFY_NATIVE_ARTICLE_AND_INDEPENDENT_SAME_EVENT"];
};
/** Do not leak original URLs or issuer names into public Actions artifacts. */
export function planHot50StandardSourceRecovery(readiness){
 if(readiness?.schema!=="geomacro.hot50-standard-150day-readiness.v1"||
    readiness.scope!=="HOT50"||
    !Array.isArray(readiness.prioritized_missing_category_cells)||
    !Number.isSafeInteger(readiness.missing_signed_country_category_cells)||
    readiness.missing_signed_country_category_cells!==readiness.prioritized_missing_category_cells.length||
    !Number.isSafeInteger(readiness.country_category_cells_checked)||
    ![3,150].includes(readiness.country_category_cells_checked) &&
      readiness.country_category_cells_checked%3!==0 ||
    typeof readiness.full_hot50_census!=="boolean")
   throw Error("HOT50_SOURCE_RECOVERY_RECEIPT_INVALID");
 if(readiness.full_hot50_census&&readiness.country_category_cells_checked!==150)
  throw Error("HOT50_SOURCE_RECOVERY_PARTIAL_CENSUS");
 const {snapshot}=hot50FourLaneSourceCrosswalk();
 const byCountry=new Map(snapshot.countries.map(row=>[row.country_iso3,row]));
 if(byCountry.size!==50||[...hot].some(country=>!byCountry.has(country)))
  throw Error("HOT50_SOURCE_RECOVERY_CROSSWALK_INVALID");
 const seen=new Set();
 const actions=readiness.prioritized_missing_category_cells.map(cell=>{
  const country=cell?.country_iso3,category=cell?.category,state=cell?.state;
  if(!hot.has(country)||!Object.hasOwn(CATEGORIES,category)||!STATES.has(state))
   throw Error("HOT50_SOURCE_RECOVERY_CELL_INVALID");
  const key=country+"|"+category;
  if(seen.has(key))throw Error("HOT50_SOURCE_RECOVERY_DUPLICATE_CELL");
  seen.add(key);
  const pinned=byCountry.get(country).direct_news_osint_feeds.filter(source=>
   source.categories.includes(CATEGORIES[category])&&
   source.kind==="official_or_public_primary_candidate"&&
   !isRetiredPrivateOsintSource(source));
  // A hostname is only a conservative candidate grouping, not proof of
  // separate authors/issuers. Native article, rights and provenance MUST
  // still be verified before any commercial qualification.
  const candidateHosts=new Set(pinned.map(source=>new URL(source.url).hostname));
  const [priority_class,required_action]=classification(state,candidateHosts.size);
  return {country_iso3:country,category,observed_state:state,
   priority_class,required_action,
   active_first_party_feed_candidates:pinned.length,
   candidate_host_groups: candidateHosts.size,
   independently_qualified_original_issuers:null,
   same_event_corrob_verified:false,commercial_rights_verified:false,
   verified_current_signed_gro:false};
 });
 actions.sort((a,b)=>a.priority_class.localeCompare(b.priority_class)||
  a.candidate_host_groups-b.candidate_host_groups||
  a.country_iso3.localeCompare(b.country_iso3)||
  a.category.localeCompare(b.category));
 const gapCounts=Object.fromEntries(Object.keys(CATEGORIES).map(category=>[
  category,actions.filter(a=>a.category===category).length]));
 const actionCounts=Object.fromEntries([...new Set(actions.map(a=>a.priority_class))]
  .sort().map(kind=>[kind,actions.filter(a=>a.priority_class===kind).length]));
 return Object.freeze({
  schema:"geomacro.hot50-standard-source-recovery-priorities.v1",
  generated_at:readiness.generated_at,scope:"HOT50",
  full_census:readiness.full_hot50_census,
  cells_checked:readiness.country_category_cells_checked,
  missing_verified_signed_cells:actions.length,
  category_gap_counts:gapCounts,priority_counts:actionCounts,
  action_queue:actions,
  target_successful_paid_standard_deliveries_per_day:150,
  plan_does_not_generate_or_verify_sources:true,
  no_http_poll_or_provider_write:true,
  no_source_activation_or_commercial_promotion:true,
  no_synthetic_issuers_signatures_or_sales:true,
  preserve_20m_priority_and_independent_paid_ledger:true,
 });
}
