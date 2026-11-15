/**
 * Item-level guard for commercial fact derivation. This is deliberately
 * fail-closed: a source-level approval alone never establishes the rights of
 * an individual feed item. Attesters sign the exact evidence object.
 */
const OGL3="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";
const CC_BY_4="https://creativecommons.org/licenses/by/4.0/";
const CC_BY_3="https://creativecommons.org/licenses/by/3.0/";
const GOV_PD_TERMS="https://www.usa.gov/government-works";
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
    sourceDomain.endsWith(".gov")&&item.publisher_owned_content_only===true;
 if(!valid)fail("LICENSE_FAMILY_UNVERIFIED");
 return Object.freeze({...item});
}

export const riskStreamItemLicenseSchema=Object.freeze(KEYS.slice());
