/**
 * Optional Predge pilot news-context v2 transport.
 * This is a signed research envelope, NOT a signed GRO, a risk score,
 * commercial provenance, or permission to act. No pre-existing partner
 * endpoint or response schema is changed.
 */
export const NEWS_CONTEXT_SCHEMA="geomacro.predge-news-context.v2";
export const PILOT_CHECK_SCHEMA="geomacro.predge-pilot-check.v1";
export const PINNED_KEY_ID="geomacro-risk-2026-03";
export const PINNED_PUBLIC_SPKI="MCowBQYDK2VwAyEAeMsePxig7TEUR3fykcx9wcBqomj9KBuJ/TXTX2QSN2k=";
export const CATEGORIES=Object.freeze(["geopolitics","macro","rare_earth"]);
export const MAX_PER_CATEGORY=50;
export const MAX_FEED_ITEMS=600;
export const MAX_WIRE_BYTES=1_500_000;
const CONTEXT_FLAGS=Object.freeze({
  execution_authorized:false,affects_risk_gate:false,
  market_relevance_verified:false,chargeable:false,
  signed_product_verified:false,
});
const HOURS_72=72*60*60*1000;
const HOUR=60*60*1000;
const encoder=new TextEncoder();
const isObject=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
function assert(value,code){if(!value)throw Error("PREDGE_PILOT_"+code);}
function safeJson(value){
  if(value===null||typeof value==="string"||typeof value==="boolean")return;
  if(typeof value==="number"){assert(Number.isFinite(value),"NONFINITE");return;}
  if(Array.isArray(value)){for(const v of value)safeJson(v);return;}
  assert(isObject(value),"NON_JSON");
  for(const k of Object.keys(value)){
    assert(k!=="__proto__"&&k!=="constructor"&&k!=="prototype","UNSAFE_KEY");
    safeJson(value[k]);
  }
}
export function canonicalJson(value){
  safeJson(value);
  const normalize=v=>Array.isArray(v)?v.map(normalize):
    isObject(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k])])):v;
  return JSON.stringify(normalize(value));
}
export const toBytes=v=>encoder.encode(canonicalJson(v));
function timestamp(s){return typeof s==="string"?Date.parse(s):NaN;}
function validateItem(item,now,ids){
  assert(isObject(item)&&typeof item.id==="string"&&item.id.length>0&&item.id.length<=256,"ITEM_ID");
  assert(!ids.has(item.id),"DUPLICATE_ID");ids.add(item.id);
  assert(CATEGORIES.includes(item.category),"ITEM_CATEGORY");
  const original=timestamp(item.original_published_at);
  assert(Number.isFinite(original)&&original<=now+300_000&&original>now-HOURS_72,"ITEM_CLOCK");
  // The real source bridge intentionally omits both fields on uncredited
  // research items; preserve absence instead of inventing attribution.
  const credits=item.sources_credited??[],notices=item.attribution_notices??[];
  assert(Array.isArray(credits)&&Array.isArray(notices),"ATTRIBUTION");
  assert(credits.length===notices.length,"ATTRIBUTION_COUNT");
  assert(credits.every(x=>typeof x==="string")&&
    notices.every(x=>typeof x==="string"),"ATTRIBUTION_TEXT");
  if(credits.length)assert(item.attribution_required===true,"ATTRIBUTION_REQUIRED");
  assert(item.chargeable===false&&item.raw_upstream_delivered===false&&
    item.signed_product_verified===false&&item.commercial_derived_rights_verified===false&&
    item.payable===false,"UNSAFE_ITEM_AUTHORITY");
  safeJson(item);
}
function counters(items){return Object.fromEntries(CATEGORIES.map(c=>[c,items.filter(x=>x.category===c).length]));}
function validCounters(v){return isObject(v)&&Object.keys(v).sort().join(",")===[...CATEGORIES].sort().join(",")&&
  CATEGORIES.every(c=>Number.isSafeInteger(v[c])&&v[c]>=0&&v[c]<=600);}
function validateFeed(feed,now){
  assert(isObject(feed)&&feed.ok===true&&feed.schema==="geomacro.derived-news-structural-feed.v1"&&
    feed.projection==="attributed_research"&&feed.retention_hours===72&&
    feed.raw_upstream_delivered===false&&feed.chargeable===false&&
    feed.signed===false&&feed.commercial_rights_verified===false&&
    feed.partner_resale_or_commercial_redistribution_authorized===false,"FEED_CONTRACT");
  assert(Array.isArray(feed.items)&&feed.items.length<=MAX_FEED_ITEMS&&validCounters(feed.counts),"FEED_SIZE");
  assert(timestamp(feed.generated_at)<=now+300_000&&timestamp(feed.generated_at)>now-HOUR,"FEED_CLOCK");
  const ids=new Set();for(const item of feed.items)validateItem(item,now,ids);
  const actual=counters(feed.items);
  assert(CATEGORIES.every(c=>feed.counts[c]===actual[c]),"FEED_COUNTS");
}
function sortItems(items){return [...items].sort((a,b)=>
  timestamp(b.original_published_at)-timestamp(a.original_published_at)||
  a.id.localeCompare(b.id,"en"));}
function prepare(feed,now){
  validateFeed(feed,now);
  const available_counts=counters(feed.items);
  const items_by_category=Object.fromEntries(CATEGORIES.map(c=>
    [c,sortItems(feed.items.filter(x=>x.category===c)).slice(0,MAX_PER_CATEGORY)]));
  const make=()=>{
    const delivered_counts=Object.fromEntries(CATEGORIES.map(c=>[c,items_by_category[c].length]));
    const truncated_counts=Object.fromEntries(CATEGORIES.map(c=>[c,available_counts[c]-delivered_counts[c]]));
    return {schema:NEWS_CONTEXT_SCHEMA,projection:"attributed_research",
      generated_at:feed.generated_at,retention_hours:72,
      available_counts,delivered_counts,truncated_counts,items_by_category,
      ...CONTEXT_FLAGS,commercial_rights_verified:false,
      partner_redistribution_authorized:false,raw_upstream_delivered:false};
  };
  return {items_by_category,make};
}
export function buildUnsignedPilotCheck(feed,now=Date.now()){
  assert(Number.isSafeInteger(now)&&now>=0,"CLOCK");
  const {items_by_category,make}=prepare(feed,now);
  function assemble(){return {
    ok:true,schema:PILOT_CHECK_SCHEMA,generated_at:new Date(now).toISOString(),
    expires_at:new Date(now+HOUR).toISOString(),pilot_only:true,
    execution_authorized:false,chargeable:false,
    risk_gate:{schema_version:"risk-gate-1.0",decision:"PAUSE",
      recommended_action:"BLOCK",reason_codes:["UNSCORED_RESEARCH_ONLY_NO_VERIFIED_GRO"],
      execution_authorized:false,news_context:make()},
    integrity:{signing_key_id:PINNED_KEY_ID,signature_scheme:"Ed25519",
      canonicalization:"geomacro-canonical-json-v1",payload_hash:null,signature:null}
  };}
  let obj=assemble();
  // Bounded deterministic reduction: never silently pretend all available
  // records were delivered, and never drop mandatory source credits.
  while(encoder.encode(JSON.stringify(obj)).byteLength>MAX_WIRE_BYTES-2000){
    const choices=CATEGORIES.filter(c=>items_by_category[c].length>0)
      .sort((a,b)=>items_by_category[b].length-items_by_category[a].length||
        CATEGORIES.indexOf(a)-CATEGORIES.indexOf(b));
    assert(choices.length>0,"ENVELOPE_TOO_LARGE");
    items_by_category[choices[0]].pop();
    obj=assemble();
  }
  validatePilotEnvelopeShape(obj,now,false);
  return obj;
}
export function signablePilotCheck(obj){
  assert(isObject(obj)&&isObject(obj.integrity),"INTEGRITY");
  return {...obj,integrity:{...obj.integrity,payload_hash:null,signature:null}};
}
export async function sha256(bytes){
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))]
    .map(x=>x.toString(16).padStart(2,"0")).join("");
}
export function validatePilotEnvelopeShape(obj,now=Date.now(),signed=true){
  assert(isObject(obj)&&obj.ok===true&&obj.schema===PILOT_CHECK_SCHEMA&&
    obj.pilot_only===true&&obj.execution_authorized===false&&obj.chargeable===false,"ENVELOPE");
  const created=timestamp(obj.generated_at),expiry=timestamp(obj.expires_at);
  assert(Number.isFinite(created)&&Number.isFinite(expiry)&&created<=now+300_000&&
    created>now-HOUR&&expiry>now&&expiry-created<=HOUR+1000,"ENVELOPE_EXPIRED");
  const rg=obj.risk_gate;
  assert(isObject(rg)&&rg.schema_version==="risk-gate-1.0"&&rg.decision==="PAUSE"&&
    rg.recommended_action==="BLOCK"&&rg.execution_authorized===false&&
    Array.isArray(rg.reason_codes)&&rg.reason_codes.length===1&&
    rg.reason_codes[0]==="UNSCORED_RESEARCH_ONLY_NO_VERIFIED_GRO","RISK_GATE_BOUNDARY");
  const ctx=rg.news_context;
  assert(isObject(ctx)&&ctx.schema===NEWS_CONTEXT_SCHEMA&&ctx.projection==="attributed_research"&&
    ctx.retention_hours===72&&timestamp(ctx.generated_at)<=created+300_000&&
    timestamp(ctx.generated_at)>created-HOUR&&
    ctx.commercial_rights_verified===false&&ctx.partner_redistribution_authorized===false&&
    ctx.raw_upstream_delivered===false,"NEWS_CONTEXT");
  for(const [k,v] of Object.entries(CONTEXT_FLAGS))assert(ctx[k]===v,"CONTEXT_AUTHORITY");
  assert(validCounters(ctx.available_counts)&&validCounters(ctx.delivered_counts)&&
    validCounters(ctx.truncated_counts)&&isObject(ctx.items_by_category)&&
    Object.keys(ctx.items_by_category).sort().join(",")===[...CATEGORIES].sort().join(","),"COUNTERS");
  const ids=new Set();
  for(const category of CATEGORIES){
    const list=ctx.items_by_category[category];
    assert(Array.isArray(list)&&list.length<=MAX_PER_CATEGORY&&
      ctx.delivered_counts[category]===list.length&&
      ctx.available_counts[category]-list.length===ctx.truncated_counts[category],"COUNTS_MISMATCH");
    for(const item of list){validateItem(item,created,ids);assert(item.category===category,"CATEGORY_MISMATCH");}
  }
  const integrity=obj.integrity;
  assert(isObject(integrity)&&integrity.signing_key_id===PINNED_KEY_ID&&
    integrity.signature_scheme==="Ed25519"&&
    integrity.canonicalization==="geomacro-canonical-json-v1","SIGNING_PIN");
  if(signed)assert(/^[a-f0-9]{64}$/.test(integrity.payload_hash)&&
    /^[A-Za-z0-9+/]{86}==$/.test(integrity.signature),"SIGNATURE_FORMAT");
  assert(encoder.encode(JSON.stringify(obj)).byteLength<=MAX_WIRE_BYTES,"WIRE_SIZE");
  safeJson(obj);return true;
}
function b64Bytes(s){
  if(typeof atob==="function")return Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  throw Error("PREDGE_PILOT_BASE64_NOT_AVAILABLE");
}
export async function verifySignedPilotCheck(obj,{now=Date.now(),registry=null}={}){
  validatePilotEnvelopeShape(obj,now,true);
  if(registry!==null){
    let data;try{data=typeof registry==="string"?JSON.parse(registry):registry;}catch{throw Error("PREDGE_PILOT_TRUST_REGISTRY");}
    const entry=data?.[PINNED_KEY_ID];
    assert(entry?.status==="active"&&entry.public_key_spki_b64===PINNED_PUBLIC_SPKI,"TRUST_REGISTRY");
    if(entry.not_before)assert(timestamp(obj.generated_at)>=timestamp(entry.not_before),"KEY_NOT_YET_ACTIVE");
    if(entry.not_after)assert(timestamp(obj.generated_at)<=timestamp(entry.not_after),"KEY_RETIRED");
  }
  const bytes=toBytes(signablePilotCheck(obj));
  assert((await sha256(bytes))===obj.integrity.payload_hash,"HASH_MISMATCH");
  const key=await crypto.subtle.importKey("spki",b64Bytes(PINNED_PUBLIC_SPKI),
    {name:"Ed25519"},false,["verify"]);
  assert(await crypto.subtle.verify("Ed25519",key,b64Bytes(obj.integrity.signature),bytes),"INVALID_SIGNATURE");
  return true;
}
