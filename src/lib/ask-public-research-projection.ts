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
const cleanAskPunctuation=(s:string):string=>s
  .replace(/\s*—\s*/gu,". ")
  .replace(/\.{2,}/gu,".")
  .replace(/\s+([,.;!?])/gu,"$1")
  .replace(/([.!?])\s*([.!?])/gu,"$1");
const DECISION_BOUNDARY="Decision support only. This answer is not execution authorization or a signed Risk Gate.";
const publicText=(value:unknown):string=>typeof value==="string"
  ? cleanAskPunctuation(mask(value))
  : "";

export function publicAskResearchProjection<T extends {
  summary:string;what_changed:string;why_it_matters:string;geomacro_view:string;
  intelligence_tier?:string;real_time_message?:string;
}>(answer:T):T & {execution_authorized:false;decision_support_boundary:string}{
  const {intelligence_tier:_internalStatus,...safe}=answer;
  const cleanView=publicText(answer.geomacro_view);
  const visibleBoundary=/decision support only/iu.test(cleanView)
    ? /not execution authorization/iu.test(cleanView)
      ? cleanView.replace(/not execution authorization/iu,"not execution authorization or a signed Risk Gate")
      : cleanView+" "+DECISION_BOUNDARY
    : (cleanView+" "+DECISION_BOUNDARY).trim();
  return {
    ...safe,
    summary:publicText(answer.summary),
    what_changed:publicText(answer.what_changed),
    why_it_matters:publicText(answer.why_it_matters),
    geomacro_view:visibleBoundary,
    execution_authorized:false,
    decision_support_boundary:DECISION_BOUNDARY,
    ...(typeof answer.real_time_message==="string"
       ? {real_time_message:publicText(answer.real_time_message)}:{}),
  } as unknown as T & {execution_authorized:false;decision_support_boundary:string};
}
