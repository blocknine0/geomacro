import {phase2hCountry} from "../../../scripts/lib/phase2h-country-originals-195.mjs";
/**
 * GeoMacro free-source, facts-only corroboration lane.
 * A search hit is a lead, never a verified publisher original.
 * This module cannot grant source licences, debit customers, certify GRI,
 * or satisfy the independent original/rights attestations in migration 0214.
 */
export const OPEN_FACTS_TIER="DERIVED_FACTS_OPEN_INTELLIGENCE";
export const OPEN_FACTS_ROLES=Object.freeze({
 GEOPOLITICS:["GOVERNMENT_WIRE","INDEPENDENT_REGIONAL"],
 MACRO_FX:["OFFICIAL_STATISTICS","MARKET_PRICE"],
 CRITICAL_MINERALS:["TRADE_CUSTOMS","INDEPENDENT_INDUSTRY"]
});
export const OPEN_PUBLIC_FEED_MAPPINGS=Object.freeze({
 "bls.gov":Object.freeze({roles:["OFFICIAL_STATISTICS"],license:"US_FEDERAL_PUBLIC_DOMAIN",mode:"ORIGINAL_ISSUER"}),
 "census.gov":Object.freeze({roles:["OFFICIAL_STATISTICS","TRADE_CUSTOMS"],license:"US_FEDERAL_PUBLIC_DOMAIN",mode:"ORIGINAL_ISSUER"}),
 "usitc.gov":Object.freeze({roles:["TRADE_CUSTOMS"],license:"US_FEDERAL_PUBLIC_DOMAIN",mode:"ORIGINAL_ISSUER"}),
 "usgs.gov":Object.freeze({roles:["OFFICIAL_STATISTICS"],license:"US_FEDERAL_PUBLIC_DOMAIN",mode:"ORIGINAL_ISSUER"}),
 "federalreserve.gov":Object.freeze({roles:["OFFICIAL_STATISTICS","MARKET_PRICE"],license:"US_FEDERAL_PUBLIC_DOMAIN",mode:"ORIGINAL_ISSUER"}),
 "whitehouse.gov":Object.freeze({roles:["GOVERNMENT_WIRE"],license:"US_FEDERAL_PUBLIC_DOMAIN",mode:"ORIGINAL_ISSUER"}),
 "state.gov":Object.freeze({roles:["GOVERNMENT_WIRE"],license:"US_FEDERAL_PUBLIC_DOMAIN",mode:"ORIGINAL_ISSUER"}),
 "gov.uk":Object.freeze({roles:["GOVERNMENT_WIRE","OFFICIAL_STATISTICS"],license:"ISSUER_TERMS_REVIEW_REQUIRED",mode:"ORIGINAL_ISSUER"}),
 "ec.europa.eu":Object.freeze({roles:["OFFICIAL_STATISTICS"],license:"ISSUER_TERMS_REVIEW_REQUIRED",mode:"ORIGINAL_ISSUER"}),
 "comtradeapi.un.org":Object.freeze({roles:["TRADE_CUSTOMS"],license:"DATASET_LICENSE_REVIEW_REQUIRED",mode:"ORIGINAL_ISSUER"}),
 "api.stlouisfed.org":Object.freeze({roles:["OFFICIAL_STATISTICS","MARKET_PRICE"],license:"SERIES_OWNER_AND_API_TERMS_REVIEW_REQUIRED",mode:"THIRD_PARTY_AGGREGATOR"}),
 "fred.stlouisfed.org":Object.freeze({roles:["OFFICIAL_STATISTICS","MARKET_PRICE"],license:"SERIES_OWNER_AND_API_TERMS_REVIEW_REQUIRED",mode:"THIRD_PARTY_AGGREGATOR"}),
 "finance.yahoo.com":Object.freeze({roles:["MARKET_PRICE"],license:"NO_AUTOMATIC_COMMERCIAL_OR_SCRAPE_APPROVAL",mode:"THIRD_PARTY_AGGREGATOR"}),
 "mining.com":Object.freeze({roles:["INDEPENDENT_INDUSTRY"],license:"PUBLISHER_TERMS_REVIEW_REQUIRED",mode:"ORIGINAL_ISSUER"}),
 "miningweekly.com":Object.freeze({roles:["INDEPENDENT_INDUSTRY"],license:"PUBLISHER_TERMS_REVIEW_REQUIRED",mode:"ORIGINAL_ISSUER"}),
 "cbc.ca":Object.freeze({roles:["INDEPENDENT_REGIONAL"],license:"PUBLISHER_TERMS_REVIEW_REQUIRED",mode:"ORIGINAL_ISSUER"}),
 "dw.com":Object.freeze({roles:["INDEPENDENT_REGIONAL"],license:"PUBLISHER_TERMS_REVIEW_REQUIRED",mode:"ORIGINAL_ISSUER"})
});
const HEX=/^[a-f0-9]{64}$/u,ISO=/^[A-Z]{3}$/u;
const EIGHTY=72*3600000,PAIR_WINDOW=48*3600000;
const deny=x=>{throw Error("OPEN_OSINT_HOLD_"+x)};
const hostname=v=>{try{const u=new URL(v);return u.protocol==="https:"&&!u.username&&!u.password&&!u.port&&!u.hash?u.hostname.toLowerCase().replace(/^www\./u,""):null}catch{return null}};
const issuer=h=>Object.entries(OPEN_PUBLIC_FEED_MAPPINGS).find(([domain])=>h===domain||h.endsWith("."+domain))?.[1]??null;
const canonical=v=>JSON.stringify(v);
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,"0")).join("");
const safeWord=x=>typeof x==="string"&&/^[A-Z0-9:_-]{2,64}$/u.test(x);
const category=x=>Object.hasOwn(OPEN_FACTS_ROLES,x);
const time=(v,now)=>{const n=Date.parse(v??"");return Number.isFinite(n)&&n<=now+60000&&now-n<=EIGHTY?n:null};
const validFacts=f=>f&&typeof f==="object"&&
 safeWord(f.event_type)&&safeWord(f.entity)&&safeWord(f.location)&&
 (f.quantitative_impact===null||
 (f.quantitative_impact&&safeWord(f.quantitative_impact.metric)&&
 typeof f.quantitative_impact.value==="number"&&Number.isFinite(f.quantitative_impact.value)&&
 Math.abs(f.quantitative_impact.value)<1e12&&safeWord(f.quantitative_impact.unit)))&&
 typeof f.event_at==="string";
export async function eventFactsFingerprint(e){
 if(!category(e?.category)||!phase2hCountry(e?.country_iso3)||!validFacts(e?.facts)||
   !Number.isFinite(Date.parse(e.facts.event_at)))deny("FACTS_INVALID");
 return hash(canonical([e.country_iso3,e.category,e.facts.event_type,e.facts.entity,
  e.facts.location,e.facts.quantitative_impact,e.facts.event_at]));
}
/**
 * Access policy is not copyright authority. Open indexed facts may be used
 * for advisory discovery, but publisher licences and provider API terms still
 * need independent verification before any paid product uses this evidence.
 */
export function openFactsRightsAssessment(e,{now=Date.now()}={}){
 const h=hostname(e?.source_url),mapped=h?issuer(h):null;
 if(!h||!mapped||!mapped.roles.includes(e.source_role))return {status:"HOLD_SOURCE_UNMAPPED",commercial_eligible:false};
 if(mapped.mode==="THIRD_PARTY_AGGREGATOR")
  return {status:"HOLD_THIRD_PARTY_AGGREGATOR",commercial_eligible:false};
 if(!e?.access?.native_publisher_page_verified||!e.access?.metadata_only_extraction||
   e.access?.raw_publisher_text_stored!==false)
  return {status:"HOLD_ORIGINAL_ACCESS_UNVERIFIED",commercial_eligible:false};
 if(mapped.license==="US_FEDERAL_PUBLIC_DOMAIN"){
  const rights=e.rights;
  if(rights?.basis==="US_FEDERAL_PUBLIC_DOMAIN"&&rights?.original_issuer_confirmed===true&&
     rights?.third_party_material_excluded===true&&
     typeof rights?.terms_url==="string"&&hostname(rights.terms_url)&&
     time(rights.checked_at,now)!==null)
   return {status:"PUBLIC_DOMAIN_DERIVED_FACTS_VERIFIED",
    rights_tier:OPEN_FACTS_TIER,commercial_eligible:false,
    publisher_content_republication_authorized:false};
 }
 if(e?.rights?.basis==="REVIEWED_OPEN_LICENSE"&&e.rights?.original_issuer_confirmed===true&&
    e.rights?.third_party_material_excluded===true&&
    e.rights?.license_allows_fact_extraction===true&&
    typeof e.rights?.terms_url==="string"&&hostname(e.rights.terms_url)&&
    typeof e.rights?.reviewer_receipt_sha256==="string"&&
    HEX.test(e.rights.reviewer_receipt_sha256)&&time(e.rights.checked_at,now)!==null){
  return {status:"OPEN_LICENSE_DERIVED_FACTS_REVIEWED",rights_tier:OPEN_FACTS_TIER,
   commercial_eligible:false,publisher_content_republication_authorized:false};
 }
 return {status:"HOLD_RIGHTS_BASIS_UNVERIFIED",commercial_eligible:false};
}
export async function inspectOpenFact(e,{now=Date.now()}={}){
 if(e?.schema!=="geomacro.open-derived-osint-observation.v1"||
    !phase2hCountry(e.country_iso3)||
    !category(e.category)||!OPEN_FACTS_ROLES[e.category].includes(e.source_role)||
    !safeWord(e.event_key)||!validFacts(e.facts)||
    !Array.isArray(e.entities)||e.entities.length<1||e.entities.length>12||
    !e.entities.every(safeWord)||e.entities.join("|")!==[...new Set(e.entities)].sort().join("|")||
    !/^[a-z0-9_.:-]{3,120}$/u.test(e.source_id??"")||
    !/^[a-z0-9_.:-]{3,100}$/u.test(e.parent_media_entity??"")||
    !/^[a-z0-9.-]{3,253}$/u.test(e.publisher_root_domain??""))
  deny("OBSERVATION_SCHEMA_INVALID");
 const host=hostname(e.source_url);
 if(!host||!(host===e.publisher_root_domain||host.endsWith("."+e.publisher_root_domain)))
  deny("SOURCE_HOST_MISMATCH");
 if(!time(e.published_at,now)||!time(e.facts.event_at,now))
  deny("PUBLISHER_OR_EVENT_CLOCK_INVALID");
 if(e.feed_origin==="GDELT_INDEX"||e.feed_origin==="GOOGLE_NEWS_INDEX"||
    e.access?.original_publisher_endpoint!==true)
  deny("SEARCH_INDEX_IS_NOT_ORIGINAL");
 const f=await eventFactsFingerprint(e);
 if(e.event_fingerprint!==f||!HEX.test(e.event_fingerprint))deny("EVENT_FINGERPRINT_INVALID");
 const rights=openFactsRightsAssessment(e,{now});
 return {event:e,rights,verified:!rights.status.startsWith("HOLD_"),
  factual_fingerprint:f,publication_clock:Date.parse(e.published_at)};
}
export async function corroborateOpenFactPairs(events,{now=Date.now()}={}){
 if(!Array.isArray(events)||events.length>100)deny("BATCH_INVALID");
 const grouped=new Map(),accepted=[],held=[];
 for(const e of events){
  try{
   const value=await inspectOpenFact(e,{now});
   if(!value.verified){held.push({source_id:e.source_id,reason:value.rights.status});continue}
   const id=e.event_fingerprint;
   if(!grouped.has(id))grouped.set(id,[]);
   grouped.get(id).push(value);
  }catch(error){held.push({source_id:String(e?.source_id??"").slice(0,120),
   reason:String(error?.message||"OPEN_OSINT_INVALID").slice(0,90)})}
 }
 for(const [fp,values] of grouped){
  values.sort((a,b)=>a.publication_clock-b.publication_clock);
  let matched=null;
  for(let i=0;i<values.length&&!matched;i++)for(let j=i+1;j<values.length;j++){
   const a=values[i].event,b=values[j].event;
   if(values[j].publication_clock-values[i].publication_clock>PAIR_WINDOW)break;
   if(a.country_iso3!==b.country_iso3||a.category!==b.category||
      a.event_key!==b.event_key||a.source_id===b.source_id||
      a.publisher_root_domain===b.publisher_root_domain||
      a.parent_media_entity===b.parent_media_entity||
      !a.entities.some(x=>b.entities.includes(x)))continue;
   if(!OPEN_FACTS_ROLES[a.category].every(role=>[a.source_role,b.source_role].includes(role)))continue;
   matched=[a,b];break;
  }
  if(matched)accepted.push({event_fingerprint:fp,country_iso3:matched[0].country_iso3,
   category:matched[0].category,event_key:matched[0].event_key,
   facts:matched[0].facts,source_ids:matched.map(x=>x.source_id),
   source_domains:matched.map(x=>x.publisher_root_domain),
   parent_media_entities:matched.map(x=>x.parent_media_entity),
   source_published_at:matched.map(x=>x.published_at),
   rights_tier:OPEN_FACTS_TIER,source_originals_verified:2,
   original_text_stored:false,commercial_eligible:false});
 }
 return {schema:"geomacro.open-derived-osint-corroboration.v1",
  eligible_pairs:accepted,held,originals_considered:events.length,
  independent_original_pairs:accepted.length,commercial_release_authorized:false};
}
export function openDerivedTierMatrix({observations=0,pairs=[],history=[],now=Date.now()}={}){
 const basic=observations>0;
 const standard=Array.isArray(pairs)&&pairs.length>0;
 const byDay=new Map();
 for(const h of history){
  if(!h||!HEX.test(h.payload_sha256??"")||!h.ed25519_verified||
    h.private_r2_readback_verified!==true||h.advisory_only!==true||
    !/^\d{4}-\d{2}-\d{2}$/u.test(h.day_utc??""))continue;
  byDay.set(h.day_utc,h);
 }
 const seven=Array.from({length:7},(_,i)=>new Date(now-i*86400000).toISOString().slice(0,10))
  .every(day=>byDay.has(day));
 return {basic:{status:basic?"READY_RESEARCH":"NO_SIGNALS"},
  standard:{status:standard?"CORROBORATED_OPEN_DERIVED_RESEARCH":"PENDING_SECOND_ORIGINAL"},
  complex:{status:standard&&seven?"SEVEN_DAY_SIGNED_ADVISORY_HISTORY":"HOLD_SIGNED_SEVEN_DAY_HISTORY"},
  commercial_delivery_authorized:false,certified_risk_indices_authorized:false,
  complex_requires_real_signed_history:true};
}
export async function signOpenDerivedAdvisory(pair,{privatePkcs8B64,publicSpkiB64,now=Date.now()}={}){
 if(!pair||pair.source_originals_verified!==2||pair.rights_tier!==OPEN_FACTS_TIER||
   pair.original_text_stored!==false||pair.commercial_eligible!==false)
  deny("ADVISORY_EVIDENCE_NOT_ADMITTED");
 const privateKey=await crypto.subtle.importKey("pkcs8",Uint8Array.from(atob(privatePkcs8B64),x=>x.charCodeAt(0)),{name:"Ed25519"},false,["sign"]);
 const publicKey=await crypto.subtle.importKey("spki",Uint8Array.from(atob(publicSpkiB64),x=>x.charCodeAt(0)),{name:"Ed25519"},false,["verify"]);
 const payload={schema:"geomacro.open-derived-osint.advisory.v1",
  event_fingerprint:pair.event_fingerprint,country_iso3:pair.country_iso3,
  category:pair.category,event_key:pair.event_key,facts:pair.facts,
  source_ids:pair.source_ids,source_domains:pair.source_domains,
  what:"Independent original publishers reported the specified event facts",
  why:"Corroborated original observations warrant further expert risk assessment",
  market:"No quantified market impact is inferred without a separate verified price observation",
  watch:"Monitor issuer updates, new independent reporting, and any corrections",
  evidence_and_confidence:{original_publications:2,rights_tier:OPEN_FACTS_TIER,
   provenance:"MACHINE_VERIFIED_DERIVED_FACTS",confidence:"CORROBORATED_NOT_CERTIFIED"},
  rights_tier:OPEN_FACTS_TIER,generated_at:new Date(now).toISOString(),
  publisher_text_republished:false,customer_delivery_authorized:false,charged:false,
  execution_authorized:false,certified_risk_index:false};
 const message=new TextEncoder().encode("geomacro.open-derived-osint.advisory.v1\n"+canonical(payload));
 const sig=new Uint8Array(await crypto.subtle.sign("Ed25519",privateKey,message));
 if(!await crypto.subtle.verify("Ed25519",publicKey,sig,message))deny("ADVISORY_SIGNER_MISMATCH");
 return {payload,payload_sha256:await hash(canonical(payload)),
  signature_b64:btoa(String.fromCharCode(...sig)),signer_scope:"OPEN_DERIVED_RESEARCH_ONLY",
  signed_gro_originals_proof:false,commercial_delivery_authorized:false};
}
