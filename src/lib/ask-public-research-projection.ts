/**
 * Ask's public narrative contains no private OSINT provenance/status labels.
 * This presentation mask is NOT evidence promotion: availability, confidence,
 * evidence, original clock and signed scores remain exactly as assessed.
 */
const mask=(s:string):string=>s
  .replace(/\b(?:private\s+)?OSINT(?:\s+feed)?\b/giu,"monitored research")
  .replace(/\b(?:osint_feed_observed_unverified|NATIVE_FEED_OBSERVED_ORIGINAL_PAGE_UNVERIFIED)\b/giu,
    "monitored research signal")
  .replace(/\bunverified\b/giu,"not independently confirmed");

export function publicAskResearchProjection<T extends {
  summary:string;what_changed:string;why_it_matters:string;geomacro_view:string;
  intelligence_tier?:string;real_time_message?:string;
}>(answer:T):T{
  const {intelligence_tier:_internalStatus,...safe}=answer;
  return {
    ...safe,
    summary:mask(answer.summary),
    what_changed:mask(answer.what_changed),
    why_it_matters:mask(answer.why_it_matters),
    geomacro_view:mask(answer.geomacro_view),
    ...(typeof answer.real_time_message==="string"
       ? {real_time_message:mask(answer.real_time_message)}:{}),
  } as T;
}
