/**
 * Opt-in signed GRI v1.2 72h portfolio policy, using its canonical source
 * lookback and weighted temporal decay. This NEVER extends the publication
 * or reviewer timestamp. Cannot be supplied as numeric caller-controlled TTL.
 */
export const GRI_RETAINED_PORTFOLIO_PROFILE =
  "GRI_V12_RETAINED_ORIGINALS_72H_FRESH_REVIEW_V1";
export const GRI_RETAINED_MAX_AGE_MS=72*60*60_000;
export const GRI_REVIEW_CURRENT_MAX_AGE_MS=90*60_000;
export function reviewedGriPortfolioProfile(signed){
  if(!signed||typeof signed!=="object"||Array.isArray(signed))
    throw Error("GRI_PORTFOLIO_REVIEWED_INPUT_REQUIRED");
  if(signed.source_freshness_profile===undefined){
    if(signed.retained_originals_current_review_completed!==undefined)
      throw Error("GRI_PORTFOLIO_UNSIGNED_OR_MISMATCHED_REVIEW_FLAG");
    return false;
  }
  if(signed.source_freshness_profile!==GRI_RETAINED_PORTFOLIO_PROFILE||
     signed.retained_originals_current_review_completed!==true)
    throw Error("GRI_PORTFOLIO_EXPLICIT_FRESH_REVIEW_REQUIRED");
  return true;
}
