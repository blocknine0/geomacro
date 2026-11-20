/**
 * Item-level guard for commercial fact derivation. This is deliberately
 * fail-closed: a source-level approval alone never establishes the rights of
 * an individual feed item. Attesters sign the exact evidence object.
 */
const OGL3="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";
const CC_BY_4="https://creativecommons.org/licenses/by/4.0/";
const CC_BY_3="https://creativecommons.org/licenses/by/3.0/";
const GOV_PD_TERMS="https://www.usa.gov/government-works";
const GDELT_FACTS_TERMS="https://www.gdeltproject.org/about.html";
const ECB_REUSE_TERMS="https://www.ecb.europa.eu/home/html/disclaimer.en.html";
const BOC_TERMS="https://www.bankofcanada.ca/terms/";
const RBA_TERMS="https://www.rba.gov.au/copyright/";
const UN_NEWS_TERMS="https://www.un.org/en/about-us/terms-of-use";
const KEYS=["license_id","license_url","terms_url","item_url","item_license_marker",
 "publisher_owned_content_only","third_party_exceptions","non_commercial",
 "restricted_material","factual_record_only","original_text_republished"];
const fail=code=>{throw Error("RISK_STREAM_ITEM_LICENSE_"+code)};
const exact=(x,keys)=>x&&typeof x==="object"&&!Array.isArray(x)&&
 Object.keys(x).sort().join("|")===keys.slice().sort().join("|");
const plainText=value=>String(value??"").replace(/<[^>]*>/gu," ").replace(
 /&(?:#x([\da-f]{1,6})|#(\d{1,7})|(amp|lt|gt|quot|apos|nbsp));/giu,(_m,hex,dec,name)=>{
  if(hex||dec){const code=Number.parseInt(hex??dec,hex?16:10);
   try{return String.fromCodePoint(code)}catch{return " "}}
  return ({amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" "})[String(name).toLowerCase()]??" ";
 });

/** Validate an item's declared license against reviewed registry evidence. */
export function validateRiskStreamItemLicense(item,sourceRights,{sourceUrl,sourceDomain,rawPayload}={}){
 if(!exact(item,KEYS))fail("EVIDENCE_SCHEMA_INVALID");
 if(typeof sourceUrl!=="string"||item.item_url!==sourceUrl)fail("ITEM_URL_MISMATCH");
 let url;try{url=new URL(item.item_url)}catch{fail("ITEM_URL_INVALID")}
 if(url.protocol!=="https:"||url.username||url.password||url.port||url.hash||
    !(url.hostname===sourceDomain||url.hostname.endsWith("."+sourceDomain)))
  fail("ITEM_URL_HOST_MISMATCH");
 if(item.third_party_exceptions!==false||item.non_commercial!==false||
    item.restricted_material!==false||item.factual_record_only!==true||
    item.original_text_republished!==false)
  fail("EXCEPTION_OR_REPUBLICATION_MARKER");
 if(typeof item.item_license_marker!=="string"||item.item_license_marker.length<4||
    item.item_license_marker.length>240)fail("ITEM_LICENSE_MARKER_MISSING");
 if(typeof rawPayload!=="string"||rawPayload.length>8000||
    !plainText(rawPayload).toLowerCase().includes(item.item_license_marker.toLowerCase())||
    !rawPayload.includes(item.license_url))fail("ITEM_LICENSE_MARKER_NOT_IN_ORIGINAL");
 if(/\b(?:non[- ]commercial|not for commercial use|all rights reserved|third[- ]party (?:copyright|content|material))\b/iu.test(plainText(rawPayload)))
  fail("ITEM_TEXT_SIGNALS_RESTRICTION");
 if(!sourceRights||sourceRights.status!=="APPROVED"||
    item.license_url!==sourceRights.rights_evidence?.licence_url||
    item.terms_url!==sourceRights.rights_evidence?.terms_url)
  fail("REGISTRY_RIGHTS_EVIDENCE_MISMATCH");
 const licenseUrl=item.license_url;
 const family=item.license_id;
 const valid=family==="UK_OGL_V3"&&licenseUrl===OGL3&&
    item.publisher_owned_content_only===true ||
   family==="CC_BY_4.0"&&licenseUrl===CC_BY_4&&
    item.publisher_owned_content_only===false ||
   family==="CC_BY_3.0"&&licenseUrl===CC_BY_3&&
    item.publisher_owned_content_only===false ||
   family==="US_GOV_PUBLIC_DOMAIN"&&licenseUrl===GOV_PD_TERMS&&
    sourceDomain.endsWith(".gov")&&item.publisher_owned_content_only===true||
   family==="GDELT_FACTS_ONLY"&&licenseUrl===GDELT_FACTS_TERMS&&
    item.terms_url===GDELT_FACTS_TERMS&&sourceDomain==="gdeltproject.org"&&
    item.publisher_owned_content_only===false&&
    item.item_license_marker==="GDELT factual event metadata only"&&
    isGdeltFactsPayload(rawPayload)||
   family==="ECB_REFERENCE_STATISTICS"&&licenseUrl===ECB_REUSE_TERMS&&
    item.terms_url===ECB_REUSE_TERMS&&sourceDomain==="ecb.europa.eu"&&
    item.publisher_owned_content_only===false&&
    item.item_license_marker==="ECB reference statistics, values unmodified"&&
    isEcbReferencePayload(rawPayload)||
   family==="BANK_OF_CANADA_OGL"&&licenseUrl===BOC_TERMS&&item.terms_url===BOC_TERMS&&
    sourceDomain==="bankofcanada.ca"&&item.publisher_owned_content_only===false&&
    item.item_license_marker==="Bank of Canada factual FX observation only"&&
    isBankOfCanadaFxPayload(rawPayload)||
   family==="RBA_CC_BY_4"&&licenseUrl===RBA_TERMS&&item.terms_url===RBA_TERMS&&
    sourceDomain==="rba.gov.au"&&item.publisher_owned_content_only===false&&
    item.item_license_marker==="Reserve Bank of Australia factual FX observation only"&&
    isRbaFxPayload(rawPayload)||
   family==="UN_NEWS_TERMS"&&licenseUrl===UN_NEWS_TERMS&&item.terms_url===UN_NEWS_TERMS&&
    sourceDomain==="news.un.org"&&item.publisher_owned_content_only===false&&
    item.item_license_marker==="UN News factual metadata only; no article text republished"&&
    isUnNewsFactsPayload(rawPayload,item.item_url);
 if(!valid)fail("LICENSE_FAMILY_UNVERIFIED");
 return Object.freeze({...item});
}

// GDELT is accepted only as a bounded factual event/actor record. In
// particular, article headlines, snippets, and article bodies are not part
// of this feed contract. The original article URL may be retained as a
// provenance pointer, but no publisher text is admitted.
function parseObject(rawPayload){
 try{const value=JSON.parse(rawPayload);return value&&typeof value==="object"&&!Array.isArray(value)?value:null}
 catch{return null}
}
function isGdeltFactsPayload(rawPayload){
 const value=parseObject(rawPayload);
 if(!value||value.schema!=="geomacro.gdelt.factual-event.v1"||
    value.license_notice_url!==GDELT_FACTS_TERMS)return false;
 const allowed=new Set(["schema","license_notice_url","license_marker","global_event_id","sql_date",
  "actor1_code","actor2_code","event_code","goldstein_scale","country_iso3",
  "published_at","source_url"]);
 return Object.keys(value).every(key=>allowed.has(key))&&
  value.license_marker==="GDELT factual event metadata only"&&
  typeof value.global_event_id==="string"&&typeof value.event_code==="string"&&
  typeof value.country_iso3==="string"&&typeof value.published_at==="string"&&
  !Object.keys(value).some(key=>/title|headline|snippet|summary|article|body|text/iu.test(key));
}
function isEcbReferencePayload(rawPayload){
 const value=parseObject(rawPayload);
 if(!value||value.schema!=="geomacro.ecb.reference-statistic.v1"||
    value.license_notice_url!==ECB_REUSE_TERMS)return false;
 const allowed=new Set(["schema","license_notice_url","license_marker","series_key","observed_at",
  "published_at","value","unit","reference_currency","counter_currency"]);
 return Object.keys(value).every(key=>allowed.has(key))&&
  value.license_marker==="ECB reference statistics, values unmodified"&&
  typeof value.series_key==="string"&&typeof value.published_at==="string"&&
  typeof value.value==="number"&&Number.isFinite(value.value)&&
  !Object.keys(value).some(key=>/title|headline|snippet|summary|article|body|text/iu.test(key));
}

function exactFactualObject(value,allowed,marker,licenseUrl){
 return value&&value.license_notice_url===licenseUrl&&value.license_marker===marker&&
  Object.keys(value).every(key=>allowed.has(key))&&
  !Object.keys(value).some(key=>/title|headline|snippet|summary|article|body|text|description/iu.test(key));
}
function isBankOfCanadaFxPayload(rawPayload){
 const value=parseObject(rawPayload),allowed=new Set(["schema","license_notice_url","license_marker",
  "observed_at","published_at","country_iso3","currency","reference_currency","value"]);
 return value?.schema==="geomacro.boc.fx-rate.v1"&&exactFactualObject(value,allowed,
  "Bank of Canada factual FX observation only",BOC_TERMS)&&
  /^[A-Z]{3}$/u.test(value.currency??"")&&/^[A-Z]{3}$/u.test(value.country_iso3??"")&&
  /^[A-Z]{3}$/u.test(value.reference_currency??"")&&Number.isFinite(value.value)&&
  typeof value.observed_at==="string"&&typeof value.published_at==="string";
}
function isRbaFxPayload(rawPayload){
 const value=parseObject(rawPayload),allowed=new Set(["schema","license_notice_url","license_marker",
  "observed_at","published_at","country_iso3","currency","reference_currency","value"]);
 return value?.schema==="geomacro.rba.fx-rate.v1"&&exactFactualObject(value,allowed,
  "Reserve Bank of Australia factual FX observation only",RBA_TERMS)&&
  /^[A-Z]{3}$/u.test(value.currency??"")&&/^[A-Z]{3}$/u.test(value.country_iso3??"")&&
  value.reference_currency==="AUD"&&Number.isFinite(value.value)&&
  typeof value.observed_at==="string"&&typeof value.published_at==="string";
}
function isUnNewsFactsPayload(rawPayload,itemUrl){
 const value=parseObject(rawPayload),allowed=new Set(["schema","license_notice_url","license_marker",
  "record_id","published_at","country_iso3","category","event_type","item_url"]);
 return value?.schema==="geomacro.un-news.factual-record.v1"&&exactFactualObject(value,allowed,
  "UN News factual metadata only; no article text republished",UN_NEWS_TERMS)&&
  value.item_url===itemUrl&&typeof value.record_id==="string"&&value.record_id.length>0&&
  typeof value.published_at==="string"&&/^[A-Z]{3}$/u.test(value.country_iso3??"")&&
  ["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"].includes(value.category)&&
  /^[a-z][a-z0-9_]{2,79}$/u.test(value.event_type??"");
}

export const riskStreamItemLicenseSchema=Object.freeze(KEYS.slice());
