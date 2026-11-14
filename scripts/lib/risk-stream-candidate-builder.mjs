import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {validateSourceRightsManifest} from "./risk-stream-source-rights-manifest.mjs";
import {canonicalRiskStreamCategory,eventIdentityFields,normalizedEventIdentity}
 from "./risk-stream-event-fingerprint.mjs";

const RIGHTS_MANIFEST_URL=new URL("../../config/risk-stream-source-rights-reviewed.v1.json",import.meta.url);
const SOURCE=/^[a-z0-9][a-z0-9_.:-]{2,119}$/u;
const DOMAIN=/^[a-z0-9.-]{3,253}$/u;
const PARENT=/^[a-z0-9_.:-]{1,100}$/u;
const ROLES=new Set(["GOVERNMENT_WIRE","INDEPENDENT_REGIONAL","OFFICIAL_STATISTICS",
 "MARKET_PRICE","TRADE_CUSTOMS","INDEPENDENT_INDUSTRY"]);
const CATEGORIES=new Set(["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"]);
const FEEDS=new Set(["RSS","WEBSITE_INTELLIGENCE","OFFICIAL_API"]);
const HEX=/^[a-f0-9]{64}$/u;
const UTC_TIME=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u;
const fail=code=>{throw Error("RISK_STREAM_CANDIDATE_BUILDER_"+code)};
const digest=value=>createHash("sha256").update(value,"utf8").digest("hex");
const exact=(value,keys)=>value&&typeof value==="object"&&!Array.isArray(value)&&
 Object.keys(value).sort().join("|")===keys.slice().sort().join("|");

function readRightsManifest(){
 try{return JSON.parse(readFileSync(fileURLToPath(RIGHTS_MANIFEST_URL),"utf8"))}
 catch{fail("RIGHTS_MANIFEST_UNAVAILABLE")}
}
function epochNow(now){
 const value=now instanceof Date?now.getTime():typeof now==="number"?now:Date.parse(now);
 if(!Number.isFinite(value))fail("CLOCK_INVALID");
 return value;
}
function sourceRows(registry){
 if(registry instanceof Map)return [...registry.values()];
 if(Array.isArray(registry))return registry;
 if(registry&&Array.isArray(registry.results))return registry.results;
 if(registry&&Array.isArray(registry.sources))return registry.sources;
 if(registry&&typeof registry==="object")return Object.values(registry);
 fail("SOURCE_REGISTRY_MISSING");
}
function normalizeUrl(value,root){
 let url;try{url=new URL(value)}catch{fail("SOURCE_URL_INVALID")}
 if(url.protocol!=="https:"||url.username||url.password||url.port||url.hash||
    url.href.length>2048||!(url.hostname===root||url.hostname.endsWith("."+root)))
  fail("SOURCE_URL_UNREGISTERED");
 return url.href;
}
function normalizedDerived(value){
 if(!exact(value,["what","why","market","watch"])||
  Object.values(value).some(text=>typeof text!=="string"||text.length<6||text.length>360||
   /(?:https?:\/\/|ftp:\/\/|mailto:|www\.)|<[^>]+>|[\r\n]/iu.test(text)))
  fail("DERIVED_FIELDS_INVALID");
 return {what:value.what,why:value.why,market:value.market,watch:value.watch};
}
function prepare(normalized,registry,now,manifest){
 const current=epochNow(now);
 const validated=validateSourceRightsManifest(manifest,current);
 const category=canonicalRiskStreamCategory(normalized?.category);
 const rights=validated.approvedEntries.find(entry=>entry.source_id===normalized?.source_id);
 if(!rights)fail("SOURCE_RIGHTS_NOT_APPROVED");
 const source=sourceRows(registry).find(row=>row?.source_id===rights.source_id);
 if(!source||!(source.enabled===1||source.enabled===true)||
    !(source.commercial_rights_approved===1||source.commercial_rights_approved===true)||
    source.publisher_root_domain!==rights.publisher_root_domain||
    source.parent_media_entity!==rights.parent_media_entity||source.source_role!==rights.source_role)
  fail("SOURCE_REGISTRY_UNVERIFIED");
 const registryExpiry=typeof source.rights_expire_at==="string"&&
  /^\d{4}-\d{2}-\d{2}$/u.test(source.rights_expire_at)?
  Date.parse(source.rights_expire_at+"T00:00:00.000Z"):Date.parse(source.rights_expire_at);
 if(!Number.isFinite(registryExpiry)||registryExpiry<=current)
  fail("SOURCE_REGISTRY_RIGHTS_EXPIRED");
 const expiry=Date.parse(rights.rights_expire_at+"T00:00:00.000Z");
 if(expiry<=current)fail("SOURCE_RIGHTS_EXPIRED");
 const published=Date.parse(normalized.published_at);
 if(typeof normalized.published_at!=="string"||!UTC_TIME.test(normalized.published_at)||
    !Number.isFinite(published)||
    published>current||current-published>72*3600000)
  fail("ORIGINAL_CLOCK_INVALID");
 const event=normalizedEventIdentity(normalized);
 const occurred=Date.parse(event.occurred_at);
 if(!Number.isFinite(occurred)||occurred>current||published<occurred-5*60000)
  fail("EVENT_CLOCK_INVALID");
 if(!SOURCE.test(rights.source_id)||!DOMAIN.test(rights.publisher_root_domain)||
    !PARENT.test(rights.parent_media_entity)||!ROLES.has(rights.source_role)||
    !CATEGORIES.has(category)||!rights.categories.includes(category)||
    !FEEDS.has(normalized.feed_origin))fail("SOURCE_OR_CATEGORY_INVALID");
 const countryIso3=normalized.country_iso3??event.country_iso3;
 if(typeof countryIso3!=="string"||countryIso3!==event.country_iso3)
  fail("COUNTRY_IDENTITY_MISMATCH");
 const payload=normalized.raw_payload;
 if(typeof payload!=="string"||payload.length<16||payload.length>8000||
    Buffer.byteLength(payload,"utf8")>8000)fail("ORIGINAL_PAYLOAD_INVALID");
 const identity=eventIdentityFields(normalized);
 const rightsEvidence=rights.rights_evidence;
 const reference=[rightsEvidence.licence_url,rightsEvidence.terms_url].join(" | ");
 if(reference.length<8||reference.length>512)fail("RIGHTS_REFERENCE_INVALID");
 const rights_verification={
  registry_source_id:rights.source_id,registry_enabled:true,
  registry_commercial_rights_approved:true,
  authorization_reference:reference,
  independent_reviewer_id:rightsEvidence.reviewer,
  checked_at_utc:rightsEvidence.reviewed_at,
  rights_expires_at_utc:rights.rights_expire_at+"T00:00:00.000Z"
 };
 const candidate={schema:"geomacro.risk-stream-candidate.v1",kind:"VERIFIED_ORIGINAL",
  country_iso3:countryIso3,category,
  feed_origin:normalized.feed_origin,...identity,source_id:rights.source_id,
  source_url:normalizeUrl(normalized.source_url,rights.publisher_root_domain),
  publisher_root_domain:rights.publisher_root_domain,
  parent_media_entity:rights.parent_media_entity,source_role:rights.source_role,
  published_at:new Date(published).toISOString(),
  original_page_sha256:digest(payload),derived:normalizedDerived(normalized.derived),
  raw_payload:payload,proof:null,rights_verification};
 return candidate;
}

/** Build the exact attester payload before requesting signatures. */
export function prepareRiskStreamCandidate(normalizedOriginal,sourceRegistry,now=Date.now(),options={}){
 const manifest=options.rightsManifest??readRightsManifest();
 return prepare(normalizedOriginal,sourceRegistry,now,manifest);
}

/** Build a worker-valid candidate only after genuine independent attester output exists. */
export function buildCandidate(normalizedOriginal,sourceRegistry,now=Date.now(),options={}){
 const candidate=prepareRiskStreamCandidate(normalizedOriginal,sourceRegistry,now,options);
 const proof=options.proof??normalizedOriginal?.proof;
 if(!exact(proof,["facts_signature_b64","rights_signature_b64"])||
    Object.values(proof).some(value=>typeof value!=="string"||!value.length))
  fail("ATTESTER_PROOF_MISSING");
 candidate.proof={facts_signature_b64:proof.facts_signature_b64,
  rights_signature_b64:proof.rights_signature_b64};
 return candidate;
}
