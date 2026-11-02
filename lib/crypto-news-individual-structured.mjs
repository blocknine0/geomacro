/**
 * Pure deterministic CryptoCompare individual-news -> GeoMacro five-part
 * metadata research. Shared by GitHub producer and D1 Worker verifier.
 * No third-party headline/body, model assertion, rights inference or paid gate.
 */
export const CRYPTO_NEWS_SCHEMA="geomacro.crypto-individual-metadata-intelligence.v1";
const HEX=/^[0-9a-f]{64}$/u;
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const TOPICS=Object.freeze({
 CRYPTO_POLICY:{categories:["geopolitics","macro"],
  importance:"An indexed digital-asset policy report may warrant regulatory monitoring, but no specific government action is established.",
  market:"A verified policy change could affect market access, custody or liquidity. No price effect is established by this metadata.",
  watch:"Read the original regulator or official document and corroborate its effective date and scope."},
 CRYPTO_MACRO:{categories:["macro"],
  importance:"Digital-asset coverage of monetary conditions can be relevant to macro-risk monitoring, without proving causation.",
  market:"Macro conditions can influence liquidity and financing; the article index does not show the direction of price moves.",
  watch:"Crosscheck relevant central-bank statements and first-party time-series observations."},
 CRYPTO_MARKET:{categories:["macro"],
  importance:"A market-structure report may identify a candidate development for independent verification.",
  market:"Trading, custody or ETF developments may affect exposure; no quantitative market effect is verified.",
  watch:"Inspect original issuer, exchange or regulator disclosures and dated market data."},
 CRYPTO_MINING:{categories:["macro"],
  importance:"Crypto mining and energy headlines are discovery leads, not critical-minerals supply evidence.",
  market:"Mining and energy costs may affect crypto infrastructure, but this item proves no operational disruption.",
  watch:"Crosscheck independently dated mining, energy or network-origin evidence."},
 CRYPTO_GENERAL:{categories:["macro"],
  importance:"An original-article link and publisher timestamp are leads for research, not confirmed events.",
  market:"No trade, FX, crypto-market or corridor exposure can be determined from one article-index entry.",
  watch:"Inspect the original report and independently verify any factual claim before risk scoring."}
});
export function cryptoNewsTopic(text){
 const s=typeof text==="string"?text.slice(0,600):"";
 if(/\b(?:sanctions?|regulat(?:or|ion|ory)|lawsuit|legislation|licen[cs]e|ban|central bank digital currency|cbdc|sec|policy)\b/iu.test(s))return "CRYPTO_POLICY";
 if(/\b(?:inflation|interest rates?|federal reserve|fed rates?|recession|treasury yields?|forex|dollar|monetary)\b/iu.test(s))return "CRYPTO_MACRO";
 if(/\b(?:bitcoin mining|cryptocurrency mining|mining pool|hashrate|hash rate|miner energy|proof.of.work)\b/iu.test(s))return "CRYPTO_MINING";
 if(/\b(?:exchange|etfs?|custod(?:y|ian)|liquidation|stablecoins?|tokenization|trading|market)\b/iu.test(s))return "CRYPTO_MARKET";
 return "CRYPTO_GENERAL";
}
export function normalizedCryptoArticleUrl(raw){
 if(typeof raw!=="string"||raw.length>2048)return null;
 try{
  const u=new URL(raw.trim());
  const host=u.hostname.toLowerCase();
  if(u.protocol!=="https:"||u.username||u.password||u.port||
     !/^[a-z0-9.-]+\.[a-z]{2,}$/u.test(host)||host==="localhost"||
     host.endsWith(".localhost")||host.endsWith(".internal")||
     host.endsWith(".local")||u.pathname.length>800||
     /(?:^|\.)example\.(?:com|net|org)$/u.test(host)||
     /^(?:10|127|172|192|169)\./u.test(host))return null;
  u.username="";u.password="";u.search="";u.hash="";
  return u.href.length<=1024?u.href:null;
 }catch{return null}
}
export function validCryptoIndividual(candidate,now=Date.now()){
 if(!candidate||typeof candidate!=="object"||Array.isArray(candidate)||
    Object.keys(candidate).sort().join("|")!==
     ["id","provider_id","article_url","source_name","published_at","title_sha256",
      "topic","categories","attribution","source_time_is_not_event_time",
      "original_article_verified","independent_corroboration_verified",
      "commercial_rights_verified","customer_delivery_enabled"].sort().join("|"))
  return false;
 if(!HEX.test(candidate.id)||!HEX.test(candidate.title_sha256)||
    typeof candidate.provider_id!=="string"||
    !/^[a-zA-Z0-9_-]{2,90}$/u.test(candidate.provider_id)||
    typeof candidate.source_name!=="string"||
    !/^[\p{L}\p{N} ._&'()-]{2,70}$/u.test(candidate.source_name)||
    normalizedCryptoArticleUrl(candidate.article_url)!==candidate.article_url||
    typeof candidate.published_at!=="string"||!ISO.test(candidate.published_at)||
    !Number.isFinite(Date.parse(candidate.published_at))||
    Date.parse(candidate.published_at)>now||
    now-Date.parse(candidate.published_at)>72*3600000||
    !Object.hasOwn(TOPICS,candidate.topic)||
    JSON.stringify(candidate.categories)!==JSON.stringify(TOPICS[candidate.topic].categories)||
    candidate.attribution!=="CRYPTOCOMPARE_NEWS_API_AGGREGATOR_METADATA"||
    candidate.source_time_is_not_event_time!==true||
    candidate.original_article_verified!==false||
    candidate.independent_corroboration_verified!==false||
    candidate.commercial_rights_verified!==false||
    candidate.customer_delivery_enabled!==false)return false;
 return true;
}
/** The five-part analysis deliberately describes the *metadata*, never the report's unverified event. */
export function buildCryptoIndividualFivePart(candidate){
 const d=TOPICS[candidate.topic];
 if(!d)throw Error("CRYPTO_NEWS_TOPIC_INVALID");
 return {
  what_happened:"CryptoCompare indexed an individual news link attributed to "+candidate.source_name+
    " with a recorded publication timestamp of "+candidate.published_at+
    ". The actual event or claim in the linked article has not been independently verified.",
  why_it_matters:d.importance,
  market_relevance:d.market,
  what_to_watch:d.watch,
  evidence_and_confidence:{
   evidence_type:"THIRD_PARTY_NEWS_INDEX_METADATA",
   source_id:"cryptocompare_news",provider_article_id:candidate.provider_id,
   original_article_url:candidate.article_url,publisher_name:candidate.source_name,
   native_publication_timestamp:candidate.published_at,
   source_title_sha256:candidate.title_sha256,
   publication_timestamp_is_not_event_time:true,
   original_article_verified:false,independent_event_corroboration:false,
   commercial_permission_confirmed:false,confidence:"INDEX_METADATA_ONLY",
   verified_news_event:false
  }
 };
}
export function cryptoIndividualRecord(candidate){
 return {
  candidate,
  structured:buildCryptoIndividualFivePart(candidate),
  analysis_kind:"PRIVATE_CRYPTO_METADATA_STRUCTURED_RESEARCH",
  channel:"CORRIDOR_ONLY",schema:CRYPTO_NEWS_SCHEMA,
  interpretation_is_automated:true,verified_news_event:false,
  signed_gro:false,commercial_eligible:false,customer_delivery_authorized:false,
  website_intelligence_writes:0,predge_writes:0
 };
}
