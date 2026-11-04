/**
 * Four-lane FIRST-PARTY source and rights inventory contract.
 * Static reference to adapters already present in GeoMacro; never grants
 * ingestion health, commercial license, public redistribution, or a new poll.
 */
import {readFileSync,existsSync} from "node:fs";
const root=new URL("../../",import.meta.url);
const LANES=Object.freeze(["geopolitics","macro","rare_earth","corridor"]);
const STATES=new Set(["EXISTING_READ_ONLY_OBSERVER",
 "EXISTING_PRIVATE_FEED_COLLECTOR","EXISTING_STRUCTURAL_REFERENCE_ADAPTER",
 "CATALOGUED_NOT_POLLING","CREDENTIAL_GATED",
 "HOLD_NOT_FREE","HOLD_PROVIDER_ELIGIBILITY"]);
const RIGHTS=new Set(["OPEN_WITH_ATTRIBUTION","US_PUBLIC_DOMAIN_GOV_WORKS",
 "OPEN_WITH_ATTRIBUTION_SUBSET","CONDITIONAL_BIS_STATISTICS_ONLY",
 "PUBLISHER_REVIEW_REQUIRED","NOT_FREE_FOR_PRODUCTION",
 "PROVIDER_ELIGIBILITY_AND_ATTRIBUTION"]);
const OPEN_CLASSES=new Set(["OPEN_WITH_ATTRIBUTION","US_PUBLIC_DOMAIN_GOV_WORKS",
 "OPEN_WITH_ATTRIBUTION_SUBSET"]);
const forbiddenRightsForFree=new Set(["NOT_FREE_FOR_PRODUCTION"]);
export function fourLaneOpenSourceRightsInventory(){
 const data=JSON.parse(readFileSync(new URL(
  "config/four-lane-free-source-rights.v1.json",root),"utf8"));
 if(data?.schema!=="geomacro.four-lane-free-source-rights.v1"||
    data.source_count!==25||!Array.isArray(data.providers)||
    data.providers.length!==25||
    JSON.stringify(data.lanes)!==JSON.stringify(LANES)||
    data.allow_commercial_billing_from_registration!==false||
    data.allow_scraping_on_public_access_only!==false||
    data.allow_paid_data_sources!==false||
    data.rights_review_does_not_verify_actual_fetch!==true||
    data.event_coverage_not_certified!==true||
    data.existing_scheduled_collectors_unchanged!==true)
   throw Error("FOUR_LANE_SOURCE_RIGHTS_POLICY_INVALID");
 const ids=new Set(),laneCounts=Object.fromEntries(LANES.map(x=>[x,0]));
 const statuses=Object.fromEntries([...STATES].map(x=>[x,0]));
 for(const x of data.providers){
  if(typeof x.id!=="string"||!/^[a-z][a-z0-9_]{2,79}$/u.test(x.id)||
     ids.has(x.id)||!LANES.includes(x.lane)||
     !STATES.has(x.ingestion_state)||!RIGHTS.has(x.rights_class)||
     typeof x.publisher!=="string"||x.publisher.length<3||
     typeof x.ingestion_method!=="string"||!x.ingestion_method||
     typeof x.limitations!=="string"||x.limitations.length<10||
     typeof x.existing_adapter_path!=="string"||
     !/^(?:scripts|global-intelligence|config)\/[a-z0-9/._-]+\.(?:mjs|json)$/u.test(x.existing_adapter_path)||
     x.existing_adapter_path.includes("..")||
     !existsSync(new URL(x.existing_adapter_path,root))||
     typeof x.terms_url!=="string"||
     !x.terms_url.startsWith("https://")||
     new URL(x.terms_url).username||new URL(x.terms_url).password||
     x.transport_verified_in_current_run!==false||
     x.native_event_verified_in_current_run!==false||
     x.publisher_content_commercially_reusable!==false||
     x.paid_risk_gate_eligible!==false)
   throw Error("FOUR_LANE_UNTRUSTED_PROVIDER_RECORD:"+x?.id);
  const shouldFetch= ["EXISTING_READ_ONLY_OBSERVER",
   "EXISTING_PRIVATE_FEED_COLLECTOR",
   "EXISTING_STRUCTURAL_REFERENCE_ADAPTER"].includes(x.ingestion_state);
  if(x.source_only_factual_metadata_allowed!==shouldFetch||
     forbiddenRightsForFree.has(x.rights_class)&&x.ingestion_state!=="HOLD_NOT_FREE"||
     x.ingestion_state==="HOLD_NOT_FREE"&&x.rights_class!=="NOT_FREE_FOR_PRODUCTION"||
     x.ingestion_state==="HOLD_PROVIDER_ELIGIBILITY"&&
       x.rights_class!=="PROVIDER_ELIGIBILITY_AND_ATTRIBUTION")
   throw Error("FOUR_LANE_PROVIDER_ACCESS_OR_RIGHTS_CONTRADICTION:"+x.id);
  ids.add(x.id);laneCounts[x.lane]++;statuses[x.ingestion_state]++;
 }
 if(LANES.some(lane=>laneCounts[lane]===0))
  throw Error("FOUR_LANE_MISSING_CATEGORY");
 return Object.freeze({schema:data.schema,providers:Object.freeze(data.providers),
  lane_counts:Object.freeze(laneCounts),ingestion_states:Object.freeze(statuses),
  open_metadata_analytics_source_candidates:data.providers.filter(x=>
   OPEN_CLASSES.has(x.rights_class)&&x.source_only_factual_metadata_allowed).length,
  commercial_risk_gate_qualified:0,
  actual_source_fetches:0,actual_d1_writes:0,actual_b2_put_get_readbacks:0,
  telegram_permissions_added:0,
  extra_provider_pollers_added:0,paid_apis_activated:0,
  rights_or_live_proof_inferred:false,
 });
}
