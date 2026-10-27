#!/usr/bin/env node
/**
 * Strict production anonymous-vs-origin materialization proof.
 * This is customer-serving read validation, not a synthetic production probe.
 * One anonymous GET plus one owner-authenticated canonical D1 GET. No D1
 * mutation, B2 call, publisher source fetch, or credential exposure.
 */
import {createHmac} from "node:crypto";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
const ORIGIN="https://geomacro-control-plane.daspallab202391.workers.dev";
const ROUTE="/v1/public/website-derived-news-immediate?offset=500";
const OWNER_ROUTE="/v1/internal/website-derived-news-origin?offset=500";
const MAX_BYTES=200_000;
async function read(fetchImpl,direct,{token=null}={}){
 const res=await fetchImpl(ORIGIN+(direct?OWNER_ROUTE:ROUTE),{
  method:"GET",redirect:"error",
  // Public read remains a browser-like cache-eligible GET.
  // Protected read has a DISTINCT uncached authenticated route, not merely
  // Cache-Control:no-cache on the same CDN-cacheable public URL.
  ...(direct?{cache:"no-store"}:{}),
  headers:{"Accept":"application/json",...(direct?{
    Authorization:"Bearer "+token,
    "Cache-Control":"no-cache"
  }:{})},
  signal:AbortSignal.timeout(12_000),
 });
 if(!res.ok)throw Error(direct?
   "MATERIALIZED_CANONICAL_HTTP_UNAVAILABLE":
   "MATERIALIZED_ANONYMOUS_HTTP_UNAVAILABLE");
 const length=Number(res.headers.get("content-length")||0);
 if(length>MAX_BYTES)throw Error("MATERIALIZED_PUBLIC_PROOF_OVERSIZE");
 const raw=await res.text();
 if(raw.length>MAX_BYTES)throw Error("MATERIALIZED_PUBLIC_PROOF_OVERSIZE");
 let doc;try{doc=JSON.parse(raw)}catch{throw Error("MATERIALIZED_PUBLIC_PROOF_JSON_INVALID")}
 if(doc?.ok!==true||doc.schema!=="geomacro.website-derived-news-feed.v1"||
    doc.page_offset!==500||doc.page_size!==250||!Array.isArray(doc.signals)||
    doc.signals.length>100||typeof doc.has_more!=="boolean"||
    doc.chargeable!==false)
  throw Error("MATERIALIZED_PUBLIC_PROOF_SCHEMA_INVALID");
 const ids=doc.signals.map(item=>item?.id);
 if(ids.some(id=>typeof id!=="string"||!/^(?:geopolitics|macro|rare_earth)-[0-9a-f]{8}$/u.test(id))||
    new Set(ids).size!==ids.length)
  throw Error("MATERIALIZED_PUBLIC_PROOF_IDS_INVALID");
 return {ids,hasMore:doc.has_more,
   receipt:res.headers.get("X-GeoMacro-Public-Offload"),
   ownerOrigin:res.headers.get("X-GeoMacro-Origin-Readback"),
   cacheControl:res.headers.get("Cache-Control")};
}
export async function verifyMaterializedAnonymousRead({
 fetchImpl=fetch,env=process.env
}={}){
 const publicResponse=await read(fetchImpl,false);
 if(publicResponse.receipt!=="d1-materialized")
  throw Error("MATERIALIZED_PUBLIC_OFFLOAD_NOT_OBSERVED");
 const secret=String(env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").trim();
 if(secret.length<32)throw Error("MATERIALIZED_OWNER_READBACK_TOKEN_MISSING");
 const token=createHmac("sha256",secret)
   .update("geomacro-control-plane-v1").digest("hex");
 const originResponse=await read(fetchImpl,true,{token});
 if(originResponse.receipt!==null||
    originResponse.ownerOrigin!=="d1-canonical"||
    originResponse.cacheControl!=="no-store")
  throw Error("MATERIALIZED_ORIGIN_BYPASS_INVALID");
 if(publicResponse.hasMore!==originResponse.hasMore||
    JSON.stringify(publicResponse.ids)!==JSON.stringify(originResponse.ids))
  throw Error("MATERIALIZED_PUBLIC_CANONICAL_IDS_DIFFER");
 return Object.freeze({
  schema:"geomacro.public-news-live-d1-offload-proof.v1",
  public_materialized_offload_verified:true,
  no_cache_canonical_bypass_verified:true,
  protected_direct_d1_origin_route_verified:true,
  same_canonical_page_ids_verified:true,
  page_offset:500,
  returned_source_neutral_items:publicResponse.ids.length,
  public_gets:1,protected_origin_gets:1,source_fetches:0,news_writes:0,
  b2_requests:0,paid_calls:0,
  account_daily_quota_guaranteed:false
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{console.log(JSON.stringify(await verifyMaterializedAnonymousRead()))}
 catch(e){
  const msg=typeof e?.message==="string"&&
    /^MATERIALIZED_[A-Z0-9_]+$/u.test(e.message)?
      e.message:"MATERIALIZED_PUBLIC_PROOF_TRANSPORT_FAILURE";
  console.error("::error::"+msg);process.exitCode=2;
 }
}
