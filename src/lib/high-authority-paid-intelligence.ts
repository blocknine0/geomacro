/**
 * First paid Intelligence launch: immutable, reviewed official-source universe.
 * This is a SALES SCOPE, not a grant of commercial rights, source certification,
 * independent same-event proof, or permission to charge.
 *
 * Dataset IDs are exact. Other sources may be used for free discovery, but
 * cannot qualify a new first-launch Intelligence Query quote.
 */
export const HIGH_AUTHORITY_PAID_INTELLIGENCE_UNIVERSE = Object.freeze({
  us_bls_public_domain_cpi_u_unadjusted_v1: "US Bureau of Labor Statistics — CPI-U unadjusted",
  usgs_mcs_2026_cc0_582a0aa231ae: "US Geological Survey — Mineral Commodity Summaries 2026 (pinned CC0)",
  usgs_mcs: "US Geological Survey — governed MCS module",
  imf_weo: "International Monetary Fund — World Economic Outlook",
  reliefweb: "UN OCHA — ReliefWeb",
  gdacs: "GDACS — Global Disaster Alert and Coordination System",
  world_bank_indicators: "World Bank — governed structural indicators",
  treasury_ind_quarterly_reporting_fx_v1: "US Treasury — governed quarterly India FX reporting",
} as const);

export const HIGH_AUTHORITY_FIVE_EVENT_FIELDS = Object.freeze([
  "headline", "source_authority", "event_timestamp", "what_happened", "why_it_matters",
] as const);

type QualifiedSourceContract = {
  source_id: string;
  commercial_usage_status: string | null;
  attribution_required: boolean;
};
type QualifiedAvailability = {
  deliverable: boolean;
  ineligible_source_ids: readonly string[];
  source_contracts: readonly QualifiedSourceContract[];
  subjects: readonly { required_source_ids: readonly string[] }[];
};
const isKnown = (id: string): id is keyof typeof HIGH_AUTHORITY_PAID_INTELLIGENCE_UNIVERSE =>
  Object.hasOwn(HIGH_AUTHORITY_PAID_INTELLIGENCE_UNIVERSE,id);

/** Scope gate operates AFTER normal source rights, freshness and independent
 * signed-product checks. A source name alone never establishes eligibility.
 */
export function assertHighAuthorityPaidIntelligenceScope(availability: QualifiedAvailability): void {
  if (!availability.deliverable || availability.ineligible_source_ids.length !== 0)
    throw Error("PAID_AUTHORITY_DELIVERABILITY_NOT_PROVEN");
  const registered = new Map(availability.source_contracts.map(x => [x.source_id,x]));
  const required = new Set(availability.subjects.flatMap(x => x.required_source_ids));
  if (!required.size || !registered.size)
    throw Error("PAID_AUTHORITY_SOURCE_PROOF_MISSING");
  for (const id of required) {
    const c = registered.get(id);
    if (!isKnown(id) || !c ||
        !["COMMERCIAL_OK","DERIVED_ONLY"].includes(c.commercial_usage_status ?? "") ||
        c.attribution_required !== false)
      throw Error("PAID_AUTHORITY_SOURCE_NOT_PREQUALIFIED");
  }
  // Refuse supplementary unreviewed source contracts as well; paid data must
  // not be blended with unnamed or uncertified input.
  for (const id of registered.keys())
    if (!required.has(id) || !isKnown(id))
      throw Error("PAID_AUTHORITY_ADDITIONAL_SOURCE_NOT_PREQUALIFIED");
}

export type QualifiedFiveFieldEvent = Readonly<{
  headline:string;source_authority:string;event_timestamp:string;
  what_happened:string;why_it_matters:string;
}>;

/** Private extractor, invoked ONLY after a distinct item is genuinely
 * corroborated and item-specific derived commercial rights are approved.
 * Retrieval-time and annual reference-period clocks are never event clocks.
 */
export function extractQualifiedFiveFieldEvent(input: {
  source_id:string;headline:unknown;event_timestamp:unknown;
  what_happened:unknown;why_it_matters:unknown;
  original_event_timestamp_verified:boolean;
  independent_same_event_verified:boolean;
  item_commercial_rights_verified:boolean;
}, now=Date.now()):QualifiedFiveFieldEvent|null {
  if(!isKnown(input.source_id) ||
     input.original_event_timestamp_verified!==true ||
     input.independent_same_event_verified!==true ||
     input.item_commercial_rights_verified!==true)return null;
  const clean=(x:unknown,max:number)=>
    typeof x==="string" && x.trim().length>0 && x.trim().length<=max &&
    !/[<>]/u.test(x)?x.trim():null;
  const headline=clean(input.headline,280);
  const what=clean(input.what_happened,1800);
  const why=clean(input.why_it_matters,1800);
  const when=input.event_timestamp;
  if(!headline||!what||!why || what===why ||
    typeof when!=="string" ||
    !/^20\d{2}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(when))
    return null;
  const timestamp=Date.parse(when);
  if(!Number.isFinite(now)||!Number.isFinite(timestamp)||timestamp>now+60_000)
    return null;
  return Object.freeze({
    headline,source_authority:HIGH_AUTHORITY_PAID_INTELLIGENCE_UNIVERSE[input.source_id],
    event_timestamp:when,what_happened:what,why_it_matters:why,
  });
}

/**
 * New Intelligence Query purchase acceptance: a scored, current event must
 * carry a complete and already qualified five-field record. Structural
 * baselines are NOT events and are unaffected. This is checked BEFORE any
 * x402 quote or funds request; absent evidence never becomes plausible prose.
 */
export function assertPaidIntelligenceEventFieldCompleteness(prepared:unknown):void {
  const record=(x:unknown):x is Record<string,unknown> =>
    x!==null&&typeof x==="object"&&!Array.isArray(x);
  if(!record(prepared) || !Array.isArray(prepared.current_state))
    throw Error("PAID_EVENT_CURRENT_STATE_REQUIRED");
  for(const value of prepared.current_state){
    if(!record(value) || !Array.isArray(value.developments))
      throw Error("PAID_EVENT_DEVELOPMENTS_INVALID");
    for(const event of value.developments){
      if(!record(event)||!record(event.qualified_five_field_event))
        throw Error("PAID_EVENT_FIVE_FIELDS_REQUIRED");
      const fields=event.qualified_five_field_event;
      if(!HIGH_AUTHORITY_FIVE_EVENT_FIELDS.every(field=>
        typeof fields[field]==="string" && (fields[field] as string).trim().length>0) ||
        Object.keys(fields).length!==HIGH_AUTHORITY_FIVE_EVENT_FIELDS.length)
        throw Error("PAID_EVENT_FIVE_FIELDS_INVALID");
      const stamp=fields.event_timestamp;
      if(typeof stamp!=="string" ||
        !/^20\\d{2}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d(?:\\.\\d{1,3})?Z$/u.test(stamp) ||
        !Number.isFinite(Date.parse(stamp)) || Date.parse(stamp)>Date.now()+60_000)
        throw Error("PAID_EVENT_ORIGINAL_TIMESTAMP_UNVERIFIED");
    }
  }
}
