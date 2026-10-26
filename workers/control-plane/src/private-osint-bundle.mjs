import {validateReusableSourceNewsItem} from "./reusable-source-news.mjs";
export const PRIVATE_OSINT_BUNDLE_SCHEMA="geomacro.private-osint-news-bundle.v1";
const domains=["geopolitics","macro","rare_earth"],pageSize=100,age=25*3600000;
const response=(data,status=200)=>Response.json(data,{status,headers:{
 "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
 "Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex,nofollow",
}});
const exact=(o,keys)=>o&&typeof o==="object"&&!Array.isArray(o)&&
 Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
const utc=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const encode=x=>btoa(JSON.stringify(x)).replace(/\+/gu,"-").replace(/\//gu,"_").replace(/=+$/u,"");
function decode(raw,country,now){
 if(typeof raw!=="string"||raw.length>1800||!/^[A-Za-z0-9_-]+$/u.test(raw))throw Error("CURSOR");
 const c=JSON.parse(atob(raw.replace(/-/gu,"+").replace(/_/gu,"/")));
 if(!exact(c,["v","country","snapshot_at","after"])||c.v!==1||c.country!==country||
   !utc(c.snapshot_at)||Date.parse(c.snapshot_at)>now||now-Date.parse(c.snapshot_at)>age||
   !exact(c.after,domains)||domains.every(d=>c.after[d]===null)||
   domains.some(d=>c.after[d]!==null&&(!Array.isArray(c.after[d])||c.after[d].length!==2||
     !utc(c.after[d][0])||!/^[a-f0-9]{64}$/u.test(c.after[d][1]))))throw Error("CURSOR");
 return c;
}
/** Only reachable after the parent private OSINT credential gate. */
export async function privateOsintBundleRead(env,query=new URLSearchParams(),now=Date.now()){
 const country=query.get("country"),raw=query.get("cursor"),limit=query.get("limit");
 // Existing private pagination defaults to 100 rows per lane. Only the
 // bounded 1-row proof mode is additionally supported, for the independent
 // post-write durability check on a shared Free D1 quota.
 const requestedPageSize=limit===null?100:limit==="1"?1:null;
 let cursor;
 try{
  if(query.get("view")!=="bundle"||requestedPageSize===null||
   [...query.keys()].some(k=>!["view","country","cursor","limit"].includes(k))||
   ["view","country","cursor","limit"].some(k=>query.getAll(k).length>1)||
   (country!==null&&!/^[A-Z]{3}$/u.test(country)))throw Error("QUERY");
  cursor=raw===null?{v:1,country,snapshot_at:new Date(now).toISOString(),after:{}}:decode(raw,country,now);
 }catch{return response({ok:false,error:"PRIVATE_OSINT_BUNDLE_QUERY_INVALID"},400)}
 if(!env?.DB)return response({ok:false,error:"PRIVATE_OSINT_D1_UNAVAILABLE"},503);
 try{
  const active=domains.filter(d=>cursor.after[d]!==null),statements=active.map(d=>{
   const where=["category=?","native_feed_published_at>=?","first_seen_at<=?"],args=[d,new Date(now-age).toISOString(),cursor.snapshot_at];
   if(country){where.push("country_iso3=?");args.push(country)}
   if(cursor.after[d]){
    where.push("(native_feed_published_at<? OR (native_feed_published_at=? AND item_id<?))");
    args.push(cursor.after[d][0],cursor.after[d][0],cursor.after[d][1]);
   }
   return env.DB.prepare("SELECT item_id,native_feed_published_at,projection_json,first_seen_at,last_seen_at "+
    "FROM private_osint_news_25h WHERE "+where.join(" AND ")+" ORDER BY native_feed_published_at DESC,item_id DESC LIMIT "+(requestedPageSize+1)).bind(...args);
  });
  // All three lanes share one D1 batch transaction and one HTTP response.
  const reads=await env.DB.batch(statements);
  if(!Array.isArray(reads)||reads.length!==active.length)throw Error("ROWSETS");
  const grouped=Object.fromEntries(domains.map(d=>[d,{count:0,items:[],has_more:false}]));
  const after=Object.fromEntries(domains.map(d=>[d,null]));let total=0;
  for(let i=0;i<active.length;i++){
   const d=active[i],rows=reads[i]?.results;
   if(reads[i]?.success===false||!Array.isArray(rows)||rows.length>requestedPageSize+1)throw Error("ROWSET");
   const visible=rows.slice(0,requestedPageSize),items=visible.map(r=>{
    const item=JSON.parse(r.projection_json);validateReusableSourceNewsItem(item,now);
    if(item.category!==d||item.id!=="news-"+r.item_id||item.source.original_published_at!==r.native_feed_published_at||
      (country!==null&&item.country_iso3!==country))throw Error("PROJECTION");
    return {...item,private_first_seen_at:r.first_seen_at,private_last_seen_at:r.last_seen_at,
     private_feed_clock_observed:true,original_page_independently_verified:false,commercially_eligible:false};
   });
   const more=rows.length>requestedPageSize;
   if(more){const last=visible.at(-1);after[d]=[last.native_feed_published_at,last.item_id]}
   grouped[d]={count:items.length,items,has_more:more};total+=items.length;
  }
  const more=domains.some(d=>after[d]!==null);
  return response({ok:true,schema:PRIVATE_OSINT_BUNDLE_SCHEMA,scope:"PROTECTED_INTERNAL_OSINT_RESEARCH_ONLY",
   retention_hours:25,snapshot_at:cursor.snapshot_at,country_iso3:country,
   category_count:3,page_size_per_category:requestedPageSize,total_items:total,categories:grouped,
   has_more:more,next_cursor:more?encode({...cursor,after}):null,
   single_d1_batch_read:true,independent_verification_required_for_ingestion:false,
   original_page_verified:false,commercial_use_authorized:false,publicly_served:false});
 }catch{return response({ok:false,error:"PRIVATE_OSINT_BUNDLE_READ_UNAVAILABLE"},503)}
}
