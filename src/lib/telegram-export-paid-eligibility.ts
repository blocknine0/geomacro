/**
 * T3: owner-export UNVERIFIED intelligence_query eligibility policy.
 *
 * The canonical x402 paid offer constructor still requires its own
 * product-specific prepared answer, exact paid bytes and commercial rights.
 * This evaluator NEVER makes a 402 offer and NEVER substitutes a Telegram
 * export claim for an independently signed GRO/GRI or a source licence.
 */
import {resolveGeomacroCapabilityPrice} from "./capability-pricing-catalog";
import {country195ByIso3} from "./canonical-country-registry-195";

const CAPABILITY="intelligence_query";
const VARIANTS=new Set(["focused","standard","complex_multi_source"]);
const DOMAINS=new Set(["geopolitics","macro","rare_earth"]);
const TOPIC_CATEGORIES:Record<string,readonly string[]>={
 conflict_geopolitics:["geopolitics"],sovereign_risk:["macro"],
 macro_risk:["macro"],fx_external_risk:["macro"],critical_minerals:["rare_earth"],
};
const AGE=72*60*60*1000;
export const TELEGRAM_EXPORT_UNVERIFIED_LIMITATION=
 "Derived from an unverified public Telegram post; not independently confirmed.";
export type TelegramExportCandidate={
 schema_version:string;category:string;topic_code:string;country_iso3:string|null;
 event_type:string;derived_summary:string;source_native_published_at:string|null;
 time_quality:"EXACT"|"UNKNOWN_TZ";observed_at:string;
 provenance:string;rights_state:string;verification_status:string;
 confidence:number;scored:boolean;execution_authorized:boolean;
};
const fail=(code:string)=>({
 status:code,eligible:false,payment_required_now:false,
 chargeable:false,execution_authorized:false,unscored:true,
 quote_authorized:false,source_rights_verified:false,
});
function validRow(row:TelegramExportCandidate,now:number){
 if(row.schema_version!=="geomacro.telegram-export-derived.v1"||
    row.provenance!=="TELEGRAM_PUBLIC_EXPORT"||
    row.rights_state!=="OWNER_DECLARED_TELEGRAM_DERIVED_ONLY"||
    row.verification_status!=="UNVERIFIED_CLAIM"||
    row.execution_authorized!==false||row.scored!==false||
    !DOMAINS.has(row.category)||
    typeof row.derived_summary!=="string"||row.derived_summary.length>280||
    !/^(Geopolitical claim|Macro\/FX claim|Critical-minerals claim) /u.test(row.derived_summary)||
    typeof row.confidence!=="number"||row.confidence<0||row.confidence>1)
  return false;
 const observed=Date.parse(row.observed_at);
 if(!Number.isFinite(observed)||observed>now||now-observed>AGE)return false;
 if(row.time_quality==="UNKNOWN_TZ")return row.source_native_published_at===null;
 if(row.time_quality!=="EXACT"||!row.source_native_published_at)return false;
 const native=Date.parse(row.source_native_published_at);
 return Number.isFinite(native)&&native<=now&&now-native<=AGE;
}
export function assessOwnerTelegramExportIntelligenceQuery(input:{
 country_iso3:string;topics:readonly string[];variant:string;
 rows:readonly TelegramExportCandidate[];distinct_private_chat_count:number;
 now?:number;feature_flag?:string;
}){
 if(!country195ByIso3(input.country_iso3)||
   !VARIANTS.has(input.variant)||!Array.isArray(input.topics)||
   input.topics.length===0||input.topics.length>3||
   input.topics.some(x=>!TOPIC_CATEGORIES[x]))
   return fail("TELEGRAM_EXPORT_REQUEST_UNSUPPORTED");
 if(input.feature_flag!=="true")return fail("TELEGRAM_DERIVED_PAID_DISABLED");
 const now=input.now??Date.now();
 if(!Number.isFinite(now)||!Array.isArray(input.rows)||input.rows.length>300)
   return fail("TELEGRAM_EXPORT_RUNTIME_UNAVAILABLE");
 // Focused one topic, standard at most three supported topics, complex
 // at least two separate chats. No chat hash ever leaves D1.
 if(input.variant==="focused"&&input.topics.length!==1)
   return fail("TELEGRAM_EXPORT_FOCUSED_TOPIC_SCOPE_INVALID");
 if(input.variant==="complex_multi_source"&&input.distinct_private_chat_count<2)
   return fail("TELEGRAM_EXPORT_SECOND_INDEPENDENT_CHAT_MISSING");
 const matching=input.rows.filter(row=>row.country_iso3===input.country_iso3&&
   input.topics.some(topic=>TOPIC_CATEGORIES[topic].includes(row.category))&&
   validRow(row,now));
 if(matching.length===0)return fail("TELEGRAM_EXPORT_NO_QUALIFIED_UNVERIFIED_CLAIM");
 if(input.variant==="focused"&&matching.some(x=>x.time_quality!=="EXACT"))
   return fail("TELEGRAM_EXPORT_FOCUSED_NATIVE_CLOCK_UNVERIFIED");
 const price=resolveGeomacroCapabilityPrice(CAPABILITY,input.variant);
 // Quotes are NOT issued here; canonical assembler/settlement gates remain.
 return {
  status:"TELEGRAM_EXPORT_UNVERIFIED_RESEARCH_CANDIDATE",
  eligible:true,execution_authorized:false,chargeable:false,
  payment_required_now:false,quote_authorized:false,unscored:true,
  provenance:"TELEGRAM_PUBLIC_EXPORT",
  verification_status:"UNVERIFIED_CLAIM",
  confidence:Math.min(...matching.map(x=>x.confidence)),
  as_of:matching.map(x=>x.source_native_published_at).filter(Boolean).sort().at(-1)??null,
  limitation:TELEGRAM_EXPORT_UNVERIFIED_LIMITATION,
  matched_claim_count:matching.length,
  price_catalog_capability:price.capability,
  price_catalog_variant:price.variant,
  price_usdc:price.amount_usdc,
  price_atomic:price.amount_atomic,
  source_rights_verified:false,independent_original_verified:false,
 };
}
export function safeOwnerTelegramExportCustomerClaim(candidate:TelegramExportCandidate,now=Date.now()){
 if(!validRow(candidate,now))throw Error("TELEGRAM_EXPORT_PAID_BOUNDARY_INVALID");
 // Keep ONLY allowlisted, authored fields; no channel handle/post ID/raw
 // content, URLs, internal hashes, sender, media or underlying private record.
 return {
  provenance:"TELEGRAM_PUBLIC_EXPORT" as const,
  verification_status:"UNVERIFIED_CLAIM" as const,
  confidence:candidate.confidence,
  as_of:candidate.source_native_published_at,
  time_quality:candidate.time_quality,
  category:candidate.category,
  topic_code:candidate.topic_code,
  derived_summary:candidate.derived_summary,
  limitation:TELEGRAM_EXPORT_UNVERIFIED_LIMITATION,
  scored:false as const,execution_authorized:false as const,
 };
}
