/**
 * Prediction-market-like MATERIAL EVENT WATCH, not a prediction market,
 * odds, risk score, GRI promotion, rightsholder licence or paid product.
 *
 * Operates ONLY on already authored, privacy-safe Geomacro derived cards.
 * Candidate decisions require a real native original date and an observed
 * specific kind of official development. Never persist news source material.
 */
export const MATERIAL_GRI_REVIEW_SCHEMA="geomacro.material-original-gri-review-queue.v1";
const CATEGORIES=Object.freeze(["geopolitics","macro","rare_earth"]);
const AGE_MS=72*60*60_000;
const MAX_CATEGORY=25;
const RULES=Object.freeze({
  geopolitics:[
    {k:"security",event:"armed_security_change",watch:"subsequent official confirmation, escalation or de-escalation"},
    {k:"trade restriction",event:"sanctions_or_export_restriction",watch:"official implementation, amendment or withdrawal"},
    {k:"trade policy",event:"cross_border_policy_change",watch:"legal enactment or change to enforcement"},
    {k:"agreement",event:"diplomatic_agreement",watch:"ratification, execution or reversal"},
    {k:"risk update",event:"official_security_alert",watch:"verified follow-on actions or withdrawal"},
  ],
  macro:[
    {k:"monetary policy",event:"central_bank_policy_decision",watch:"confirmed rate, policy implementation or reversal"},
    {k:"price data",event:"official_inflation_or_price_release",watch:"independently checked official statistical value and period"},
    {k:"trade policy",event:"trade_or_tariff_policy",watch:"implementation, duties or reversal"},
    {k:"trade restriction",event:"external_trade_restriction",watch:"effective restrictions or formal changes"},
    {k:"risk update",event:"financial_stability_warning",watch:"confirmed central-bank or regulator action"},
  ],
  rare_earth:[
    {k:"production",event:"critical_mineral_production_milestone",watch:"verified commissioning, production or supply change"},
    {k:"trade restriction",event:"mineral_export_control",watch:"implementation, licensing or withdrawal"},
    {k:"approval",event:"mine_or_processing_approval",watch:"final permit conditions or construction milestone"},
    {k:"funding",event:"strategic_mineral_financing",watch:"financial close or deployment confirmation"},
    {k:"agreement",event:"mineral_offtake_or_supply_agreement",watch:"contract execution or shipment confirmation"},
    {k:"trade policy",event:"mineral_trade_policy",watch:"enforcement, change or withdrawal"},
  ],
});
const KIND_PATTERN=/^[a-z][a-z -]{2,50}$/u;
const ID_PATTERN=/^(geopolitics|macro|rare_earth)-[a-z0-9-]{4,100}$/u;
const ISO=/^\d{4}-\d\d-\d\d(?:T\d\d:\d\d:\d\d(?:\.\d{1,3})?Z)?$/u;

function eligible(signal,category,now){
  if(!signal||signal.category!==category||
     signal.status!=="official_release_observed_unscored"||
     signal.same_event_corrob_verified!==false||signal.severity!==null||
     signal.observed_release_count!==1||
     !ID_PATTERN.test(signal.id??"")||!signal.id.startsWith(category+"-")||
     !KIND_PATTERN.test(signal.development_type??"")||
     typeof signal.published_at!=="string"||!ISO.test(signal.published_at)||
     (signal.date_precision!=="exact"&&signal.date_precision!=="day"))return false;
  const ms=Date.parse(signal.published_at);
  if(!Number.isFinite(ms)||ms>now||now-ms>AGE_MS)return false;
  // Existing canonical reader already enforced future-clock / conservative
  // verified-original day gating. This independent downstream guard keeps
  // future clocks and early timestamps out of private watch material.
  if(signal.date_precision==="exact"&&ms>now)return false;
  if(signal.date_precision==="day"&&ms+36*60*60_000>now)return false;
  return true;
}
function candidatesForCategory(category,signals,now){
  const rules=RULES[category];
  if(!rules||!Array.isArray(signals))throw Error("MATERIAL_GRI_SOURCE_REPORT_INVALID");
  const seen=new Set(),out=[];
  for(const signal of signals){
    if(!eligible(signal,category,now)||seen.has(signal.id))continue;
    const rule=rules.find(x=>x.k===signal.development_type);
    if(!rule)continue;
    seen.add(signal.id);
    out.push(Object.freeze({
      schema:"geomacro.material-gri-original-review-candidate.v1",
      derived_event_id:signal.id,
      category,
      event_kind:rule.event,
      original_published_at:signal.published_at,
      original_date_precision:signal.date_precision,
      geography:typeof signal.geography==="string"&&
        /^[\p{L}\p{M}][\p{L}\p{M}\p{N} .,\x27’()\-]{1,69}$/u.test(signal.geography)&&
        signal.geography.length<=70?signal.geography:null,
      follow_up_verification_focus:rule.watch,
      evidence_class:"SINGLE_OFFICIAL_RELEASE_OBSERVED_UNSCORED",
      independent_originals_verified:false,
      article_use_rights_verified:false,
      materiality_or_impact_verified:false,
      is_predictive_market_contract:false,
      predicted_outcome:null,
      prediction_probability:null,
      gri_risk_score:null,
      gri_scoring_authorized:false,
      risk_indices_update_authorized:false,
      customer_delivery_authorized:false,
      supabase_required:false,
    }));
  }
  return out.sort((a,b)=>b.original_published_at.localeCompare(a.original_published_at)||
    a.derived_event_id.localeCompare(b.derived_event_id)).slice(0,MAX_CATEGORY);
}
export function buildMaterialGriNewsReviewQueue(reports,now=Date.now()){
  if(!Array.isArray(reports)||reports.length!==3||
     new Set(reports.map(x=>x?.category)).size!==3||
     !Number.isFinite(now))throw Error("MATERIAL_GRI_THREE_CATEGORY_PROOF_REQUIRED");
  const categories=CATEGORIES.map(category=>{
    const report=reports.find(x=>x.category===category);
    if(!report||!Number.isSafeInteger(report.healthy_feed_count)||
       report.healthy_feed_count<1||
       !Array.isArray(report.signals)||
       !Number.isFinite(Date.parse(report.checked_at))||
       Date.parse(report.checked_at)>now||
       now-Date.parse(report.checked_at)>15*60_000)
      throw Error("MATERIAL_GRI_CURRENT_OFFICIAL_SOURCE_READ_REQUIRED");
    const candidates=candidatesForCategory(category,report.signals,now);
    return Object.freeze({category,source_feeds_reachable:report.healthy_feed_count,
      candidates_count:candidates.length,candidates});
  });
  return Object.freeze({
    schema:MATERIAL_GRI_REVIEW_SCHEMA,
    generated_at:new Date(now).toISOString(),
    retention_hours:72,
    selection:"ISSUER_ORIGINAL_MATERIAL_DEVELOPMENT_REVIEW",
    categories,
    // This queue can SUGGEST GRI review, not assert independent country,
    // rights, exact evidence bytes or a real scored index change.
    destination:"PRIVATE_GRI_EVIDENCE_REVIEW_ONLY",
    gri_promotion_status:"BLOCKED_PENDING_INDEPENDENT_EVIDENCE_RIGHTS_AND_SIGNED_CERTIFICATION",
    any_scored_risk:false,
    is_prediction_market:false,
    third_party_news_or_licenses_redistributed:false,
    raw_source_storage:false,
    customer_chargeable:false,
    writes_to_supabase:0,
    writes_to_gri:0,
    payments:0,
  });
}

/**
 * Auto Ingest read-only watcher: the canonical D1 journal contains ONLY
 * Geomacro-derived news from a previously signed/checked publication.
 * Reading it does NOT verify the issuer a second time. Do not fabricate a
 * healthy source report from a D1 GET: this has a distinct provenance.
 */
export function buildMaterialGriReviewFromDerivedD1(feed,now=Date.now()){
  if(!feed||feed.ok!==true||
     feed.schema!=="geomacro.website-derived-news-feed.v1"||
     feed.retention_hours!==72||feed.retention_days!==3||
     feed.delivery_scope!=="free_website_only"||
     (feed.original_release_delay_minutes!==0&&feed.original_release_delay_minutes!==15)||
     !Array.isArray(feed.signals)||feed.signals.length>250||
     !Number.isFinite(now))throw Error("MATERIAL_GRI_D1_DERIVED_ONLY_SOURCE_REQUIRED");
  const categories=CATEGORIES.map(category=>{
    const candidates=candidatesForCategory(category,
      feed.signals.filter(s=>s?.category===category),now);
    return Object.freeze({category,candidates_count:candidates.length,candidates});
  });
  return Object.freeze({
    schema:MATERIAL_GRI_REVIEW_SCHEMA,
    generated_at:new Date(now).toISOString(),
    retention_hours:72,
    selection:"ISSUER_ORIGINAL_MATERIAL_DEVELOPMENT_REVIEW",
    categories,
    destination:"PRIVATE_GRI_EVIDENCE_REVIEW_ONLY",
    original_source_reverified_in_this_run:false,
    provenance:"PREVIOUSLY_COLLECTED_D1_DERIVED_NEWS",
    gri_promotion_status:"BLOCKED_PENDING_INDEPENDENT_EVIDENCE_RIGHTS_AND_SIGNED_CERTIFICATION",
    any_scored_risk:false,is_prediction_market:false,
    third_party_news_or_licenses_redistributed:false,
    raw_source_storage:false,customer_chargeable:false,
    writes_to_supabase:0,writes_to_gri:0,payments:0,
  });
}
