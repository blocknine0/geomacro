export const OPEN_CONTEXT_CATEGORIES=["geopolitics","macro-fx","critical-minerals"] as const;
const keys=["schema_version","category","mode","checked_at","source_families_attempted","source_families_readable",
  "source_families_unavailable","status","findings","licensed_source_credits","observations_are_current_release_news",
  "source_event_and_period_clocks_distinct","source_names_and_urls_private_except_required_credits",
  "upstream_payloads_exposed","risk_score","independent_same_event_verification","signed_gro_generated",
  "x402_payment_required","chargeable","paid_delivery_authorized","persistent_storage_written"];
const signalKeys=["finding_key","evidence_class","observation_type","observation_period","clock_semantics",
  "geomacro_finds","why_it_matters","independent_same_event_verification","score"];
export function validOpenDataContext(v:any,category:string,now=Date.now()):boolean{
  if(!v||typeof v!=="object"||Object.keys(v).some(k=>!keys.includes(k))||Object.keys(v).length!==keys.length||
    !OPEN_CONTEXT_CATEGORIES.includes(category as any)||v.category!==category||
    v.schema_version!=="geomacro.category-open-data-observations.v1"||v.mode!=="UNSCORED_OPEN_DATA_CONTEXT"||
    !Number.isSafeInteger(v.source_families_attempted)||v.source_families_attempted<1||v.source_families_attempted>25||
    !Number.isSafeInteger(v.source_families_readable)||v.source_families_readable<1||v.source_families_readable>v.source_families_attempted||
    v.source_families_unavailable!==v.source_families_attempted-v.source_families_readable||
    !["DERIVED_CONTEXT_AVAILABLE","NO_QUALIFYING_CONTEXT"].includes(v.status)||
    v.observations_are_current_release_news!==false||v.source_event_and_period_clocks_distinct!==true||
    v.source_names_and_urls_private_except_required_credits!==true||v.upstream_payloads_exposed!==false||v.risk_score!==null||
    v.independent_same_event_verification!==false||v.signed_gro_generated!==false||v.x402_payment_required!==false||
    v.chargeable!==false||v.paid_delivery_authorized!==false||v.persistent_storage_written!==false||
    !Array.isArray(v.findings)||v.findings.length>8||!Array.isArray(v.licensed_source_credits)||v.licensed_source_credits.length>25||
    v.licensed_source_credits.some((s:any)=>typeof s!=="string"||s.length>230))return false;
  const at=Date.parse(v.checked_at);
  if(!Number.isFinite(at)||at>now||now-at>3*60*60_000||JSON.stringify(v).length>48_000||/https?:\/\/|www\.|[<>]/iu.test(JSON.stringify(v)))return false;
  return v.findings.every((s:any)=>s&&typeof s==="object"&&Object.keys(s).length===signalKeys.length&&
    Object.keys(s).every(k=>signalKeys.includes(k))&&s.evidence_class==="official_open_data_unscored"&&
    ["event_occurrence","catalog_added_day","reference_year","dataset_edition","reference_month","reference_day","retrieval_snapshot","award_obligation_day"].includes(s.clock_semantics)&&
    s.independent_same_event_verification===false&&s.score===null&&
    ["finding_key","observation_type","observation_period","geomacro_finds","why_it_matters"].every(k=>typeof s[k]==="string"&&s[k].length>0&&s[k].length<1400));
}
