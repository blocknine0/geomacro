/**
 * Strict no-funds candidate source-health gate with redacted failure reasons.
 * Production HTTP 503 must remain 503 when ANY category lacks independently
 * fetched reviewed source observations; no source URL, original title, rights
 * grant, credential or private signing material appears in the diagnostic.
 */
export const WEB_CANDIDATE_CATEGORIES=Object.freeze([
 "geopolitics","macro-fx","critical-minerals",
]);
function iso(value,now){
 if(typeof value!=="string"||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T/u.test(value))return false;
 const ms=Date.parse(value);
 return Number.isFinite(ms)&&ms<=now+5000&&now-ms<=120000;
}
export function inspectWebCandidateThreeCategoryHealth(
 status,body,{now=Date.now()}={}
){
 const validStatus=Number.isInteger(status)&&status>=100&&status<=599;
 const scope=body&&typeof body==="object"&&!Array.isArray(body)?body:{};
 const headersValid=validStatus&&Number.isFinite(now)&&
  scope.schema==="geomacro.product-scoped-deep-health.v1"&&
  scope.legacy_signed_intelligence_gri_risk_indices==="NOT_EVALUATED_IN_THIS_PROFILE"&&
  scope.x402_payment_authorized===false&&
  scope.fresh_signed_snapshot_readiness_attested===false&&
  scope.all_195_countries_fresh_news_verified===false&&
  iso(scope.checked_at,now);
 const categories=Object.fromEntries(WEB_CANDIDATE_CATEGORIES.map(category=>{
  const x=scope.categories?.[category];
  const shape=x&&typeof x==="object"&&!Array.isArray(x);
  const fetched=shape&&x.source_fetch_accepted===true;
  const observations=shape&&Number.isSafeInteger(x.eligible_observations)&&
   x.eligible_observations>=0&&x.eligible_observations<=6?
    x.eligible_observations:0;
  const valid=Boolean(headersValid&&fetched&&observations>0&&
   x.status==="SOURCE_OBSERVATIONS_AVAILABLE"&&
   x.signed_gro_required===false);
  return [category,{
   accepted:valid,
   eligible_count:valid?observations:0,
   gate:!headersValid?"SCOPED_RESPONSE_CONTRACT_OR_CLOCK_INVALID":
    !shape?"CATEGORY_STATUS_ABSENT_OR_INVALID":
    !fetched?"SOURCE_FETCH_OR_REVIEWED_OBSERVATIONS_UNAVAILABLE":
    !valid?"CATEGORY_OBSERVATION_CONTRACT_INVALID":
    "SOURCE_OBSERVATIONS_AVAILABLE",
  }];
 }));
 const ready=headersValid&&status===200&&scope.ok===true&&
  scope.source_readiness_verified===true&&
  WEB_CANDIDATE_CATEGORIES.every(category=>categories[category].accepted);
 return Object.freeze({
  schema:"geomacro.web-candidate-three-category-health-gate.v1",
  ready:Boolean(ready),http_status:validStatus?status:0,
  categories,
  original_source_evidence_verified:false,
  current_signed_gri_verified:false,
  current_signed_hot_products_verified:false,
  commercial_rights_granted:false,
  x402_payment_authorized:false,
  raw_response_or_private_source_logged:false,
 });
}
