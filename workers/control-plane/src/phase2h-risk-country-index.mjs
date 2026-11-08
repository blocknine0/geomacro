/** Canonical D1 original-source country lookup for Unified Risk Gate.
 * Immutable phase2h original (raw_json, raw_sha256, record_id, B2 SHA)
 * is never modified. Attribution is derived from the publisher HEADLINE
 * using the existing reviewed 195-country resolver, never its host.
 *
 * The legacy global latest-40-then-country filter is replaced by an exact
 * country/category/date composite index. Historical NULL rows are caught up
 * in bounded 40-row cron batches; unattributed headlines use ZZZ, never a
 * fabricated country.
 */
import {resolvePhase2hObjectPointer}
 from "./phase2h-raw-object-refs.mjs";
import {phase2hHeadlineCountryCandidate,phase2hCountry}
 from "../../../scripts/lib/phase2h-country-originals-195.mjs";

const CATEGORIES=new Set(["geopolitics","macro","rare_earth"]);
const SHA=/^[0-9a-f]{64}$/u;
const HOUR=60*60*1000;
const MAX_BACKFILL=40;
export const RISK_UNATTRIBUTED_ISO3="ZZZ";
export const RISK_COUNTRY_BACKFILL_LIMIT=MAX_BACKFILL;

export function riskCountryFromOriginalTitle(title){
 if(typeof title!=="string"||!title.trim()||title.length>260)
  return RISK_UNATTRIBUTED_ISO3;
 const id=phase2hHeadlineCountryCandidate(title);
 return phase2hCountry(id)?id:RISK_UNATTRIBUTED_ISO3;
}
export async function readIndexedRiskCountryOriginals(env,{
 countryId,category,since,until,
}={}){
 if(!phase2hCountry(countryId)||!CATEGORIES.has(category)||
  typeof since!=="string"||!Number.isFinite(Date.parse(since))||
  typeof until!=="string"||!Number.isFinite(Date.parse(until)))
  throw Error("RISK_COUNTRY_INDEX_INVALID_TARGET");
 if(!env?.DB?.prepare)throw Error("RISK_COUNTRY_INDEX_D1_UNAVAILABLE");
 const data=await env.DB.prepare(
  "SELECT record_id,raw_sha256,raw_json,original_published_at "+
  "FROM phase2h_private_raw_news INDEXED BY idx_phase2h_risk_country_category_clock "+
  "WHERE risk_country_iso3=? AND category=? "+
  "AND original_published_at>=? AND original_published_at<=? "+
  "ORDER BY original_published_at DESC,record_id DESC LIMIT 40"
 ).bind(countryId,category,since,until).all();
 if(!Array.isArray(data?.results)||data.results.length>40)
  throw Error("RISK_COUNTRY_INDEX_INVALID_READBACK");
 if(env.GEOMACRO_PHASE2H_REF_ONLY_READERS_V1!=="1")
  return data.results;
 // Staged, individually gated parity reader for R2-only protected original
 // pointers. No D1 JSON column or commercial entitlement read. Legacy rows
 // remain readable; R2 bytes are hydrated ONLY into bounded request memory.
 const refs=await env.DB.prepare(
  "SELECT record_id,category,original_published_at,first_ingested_at,"+
  "raw_sha256,object_sha256,object_key,bundle_bytes,record_sha256,"+
  "record_bytes,bundle_index,signed_at,pointer_hmac_sha256,"+
  "risk_country_iso3,storage_backend "+
  "FROM phase2h_raw_object_refs_v1 "+
  "INDEXED BY idx_phase2h_ref_country_category_clock_v1 "+
  "WHERE risk_country_iso3=? AND category=? "+
  "AND original_published_at>=? AND original_published_at<=? "+
  "ORDER BY original_published_at DESC,record_id DESC LIMIT 40"
 ).bind(countryId,category,since,until).all();
 if(!Array.isArray(refs?.results)||refs.results.length>40)
  throw Error("RISK_COUNTRY_REF_READBACK_INVALID");
 const fromLegacy=data.results.map(x=>({...x,legacy:true}));
 const merged=[...fromLegacy,...refs.results.map(x=>({...x,legacy:false}))]
  .sort((a,b)=>String(b.original_published_at).localeCompare(String(a.original_published_at))||
    String(b.record_id).localeCompare(String(a.record_id)));
 const unique=[],seen=new Set();
 for(const row of merged){
  if(seen.has(row.record_id))continue;
  seen.add(row.record_id);unique.push(row);
  if(unique.length>=40)break;
 }
 const {validPrivateRawNews}=await import("./phase2h-private-raw-news.mjs");
 const cache=new Map(),output=[];
 for(const row of unique){
  if(row.legacy){output.push({
    record_id:row.record_id,raw_sha256:row.raw_sha256,
    raw_json:row.raw_json,original_published_at:row.original_published_at
   });continue;}
  const record=await resolvePhase2hObjectPointer(
   env,row,validPrivateRawNews,Date.now(),cache);
  if(phase2hHeadlineCountryCandidate(record.original.original_title)!==countryId)
   throw Error("RISK_COUNTRY_REF_TITLE_DIVERGED");
  output.push({record_id:record.record_id,raw_sha256:record.raw_sha256,
   raw_json:JSON.stringify(record),
   original_published_at:record.original.original_published_at});
 }
 return output;
}
/** Backfill at most 40 existing validated private originals per tick.
 * 1 partial-index read + 1 set-based update + 1 exact readback.
 * No 195-country fanout, feed fetch, raw copy, mutation of B2 or paid routes.
 */
export async function backfillRiskCountryIndex(env,{now=Date.now()}={}){
 if(!env?.DB?.prepare||!Number.isFinite(now))
  return {ok:false,error:"RISK_COUNTRY_BACKFILL_D1_UNAVAILABLE"};
 try{
  const cutoff=new Date(now-72*HOUR).toISOString();
  const found=await env.DB.prepare(
   "SELECT record_id,category,raw_sha256,raw_json,original_published_at "+
   "FROM phase2h_private_raw_news INDEXED BY idx_phase2h_risk_country_unindexed_recent "+
   "WHERE risk_country_iso3 IS NULL AND first_ingested_at>=? "+
   "ORDER BY first_ingested_at ASC,record_id ASC LIMIT 40"
  ).bind(cutoff).all();
  const rows=found?.results;
  if(!Array.isArray(rows)||rows.length>MAX_BACKFILL)
   return {ok:false,error:"RISK_COUNTRY_BACKFILL_READBACK_INVALID"};
  if(!rows.length)return {ok:true,indexed:0,unattributed:0};
  const annotations=[];
  for(const r of rows){
   if(!SHA.test(String(r.record_id??""))||
    !SHA.test(String(r.raw_sha256??""))||!CATEGORIES.has(r.category))
    return {ok:false,error:"RISK_COUNTRY_BACKFILL_CORRUPT_ORIGINAL"};
   let raw;
   try{raw=JSON.parse(r.raw_json)}catch{
    return {ok:false,error:"RISK_COUNTRY_BACKFILL_CORRUPT_ORIGINAL"};
   }
   if(raw?.record_id!==r.record_id||raw.raw_sha256!==r.raw_sha256||
      raw?.original?.original_published_at!==r.original_published_at||
      raw.category!==r.category||
      typeof raw.original.original_title!=="string")
    return {ok:false,error:"RISK_COUNTRY_BACKFILL_CORRUPT_ORIGINAL"};
   annotations.push([r.record_id,riskCountryFromOriginalTitle(raw.original.original_title)]);
  }
  const json=JSON.stringify(annotations);
  const update=await env.DB.prepare(
   "UPDATE phase2h_private_raw_news "+
   "SET risk_country_iso3=(SELECT json_extract(j.value,'$[1]') "+
   "FROM json_each(?) AS j WHERE json_extract(j.value,'$[0]')=phase2h_private_raw_news.record_id) "+
   "WHERE risk_country_iso3 IS NULL AND record_id IN "+
   "(SELECT json_extract(value,'$[0]') FROM json_each(?))"
  ).bind(json,json).run();
  if(update?.success===false)return {ok:false,error:"RISK_COUNTRY_BACKFILL_UPDATE_FAILED"};
  const verified=await env.DB.prepare(
   "SELECT record_id,risk_country_iso3 FROM phase2h_private_raw_news "+
   "WHERE record_id IN (SELECT json_extract(value,'$[0]') FROM json_each(?)) LIMIT 40"
  ).bind(json).all();
  const proof=new Map((verified?.results??[]).map(x=>[x.record_id,x.risk_country_iso3]));
  if(proof.size!==annotations.length||
   annotations.some(([id,country])=>proof.get(id)!==country))
   return {ok:false,error:"RISK_COUNTRY_BACKFILL_HASH_ID_READBACK_MISMATCH"};
  return {ok:true,indexed:annotations.length,
   unattributed:annotations.filter(x=>x[1]===RISK_UNATTRIBUTED_ISO3).length,
   country_index_receipts_verified:true};
 }catch{return {ok:false,error:"RISK_COUNTRY_BACKFILL_SQL_FAILED"}}
}
