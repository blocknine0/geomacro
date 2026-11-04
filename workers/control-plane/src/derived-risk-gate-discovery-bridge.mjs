/**
 * Restricted-source, ALL-INGESTED D1 discovery intake for GeoMacro Risk Gates.
 * Four existing ingestion lanes, no provider pulls and no original expression
 * leaves the Worker. This is NOT same-event verification or paid eligibility.
 * The existing root-admin auth must be checked in index.mjs BEFORE this handler.
 *
 * GET: read a deterministic <=100 metadata-only page after the durable cursor.
 * POST: atomically record the whole previously read page as unverified discovery
 *       and advance the exact lane cursor; independent exact readback required.
 * GET ?view=pending: protected metadata-only pending queue for the next stage.
 */
const LANES=Object.freeze({
 canonical:Object.freeze({
  table:"phase2h_private_raw_news",id:"record_id",at:"first_ingested_at",
  clock:"original_published_at",sourceHash:"raw_sha256",country:"risk_country_iso3",
  retention:72,category:"category",
 }),
 private_osint:Object.freeze({
  table:"private_osint_news_25h",id:"item_id",at:"first_seen_at",
  clock:"native_feed_published_at",sourceHash:"item_id",country:"country_iso3",
  retention:25,category:"category",
 }),
 reusable_news:Object.freeze({
  table:"reusable_news_items",id:"item_id",at:"first_seen_at",
  clock:"published_at",sourceHash:"item_id",country:null,
  retention:25,category:"category",
 }),
 gdelt_cameo:Object.freeze({
  table:"risk_gate_gdelt_event_index",id:"event_ref_id",at:"first_seen_at",
  clock:"gdelt_index_at",sourceHash:"source_url_sha256",country:null,
  retention:72,category:null,
 }),
});
export const DERIVED_DISCOVERY_BRIDGE_SCHEMA="geomacro.derived-risk-discovery-bridge.v1";
export const DERIVED_DISCOVERY_LANES=Object.freeze(Object.keys(LANES));
const CATS=new Set(["geopolitics","macro","rare_earth"]);
const SHA=/^[a-f0-9]{64}$/u;
const UTC=/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u;
const LIMIT=100;
const response=(value,status=200)=>Response.json(value,{status,headers:{
 "Cache-Control":"private,no-store","X-Content-Type-Options":"nosniff",
 "Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex,nofollow"
}});
const digest=async text=>{
 const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
 return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("");
};
const validUtc=value=>typeof value==="string"&&UTC.test(value)&&
 Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,19)===value.slice(0,19);
const dateIso=ms=>new Date(ms).toISOString();
const own=(obj,keys)=>obj&&typeof obj==="object"&&!Array.isArray(obj)&&
 Object.keys(obj).length===keys.length&&keys.every(k=>Object.hasOwn(obj,k));
const safeRow=(lane,row)=>{
 if(!SHA.test(row?.original_ref??"")||!SHA.test(row?.source_sha??"")||
    !validUtc(row?.first_seen_at)||typeof row?.observed_clock!=="string"||
    row.observed_clock.length<10||row.observed_clock.length>30||
    !Number.isFinite(Date.parse(row.observed_clock))||
    !CATS.has(row.category)||!(row.country_iso3===null||
       /^[A-Z]{3}$/u.test(row.country_iso3)))throw Error("DISCOVERY_SOURCE_ROW_INVALID");
 return row;
};
function sqlFor(lane){
 const s=LANES[lane];
 const cat=s.category??"'geopolitics'";
 const country=s.country??"NULL";
 return "SELECT "+s.id+" AS original_ref,"+s.sourceHash+" AS source_sha,"+
  s.at+" AS first_seen_at,"+s.clock+" AS observed_clock,"+
  cat+" AS category,"+country+" AS country_iso3 "+
  "FROM "+s.table+" WHERE "+s.at+">=? AND "+s.at+"<=? AND ("+
  s.at+">? OR ("+s.at+"=? AND "+s.id+">?)) "+
  "ORDER BY "+s.at+" ASC,"+s.id+" ASC LIMIT 101";
}
async function readPage(env,lane,now){
 const s=LANES[lane];
 const cutoff=dateIso(now-s.retention*3600000);
 const checkpoint=await env.DB.prepare(
  "SELECT cursor_at,cursor_ref FROM derived_risk_gate_discovery_cursors WHERE lane=?"
 ).bind(lane).first();
 let cursorAt=checkpoint?.cursor_at??cutoff;
 let cursorRef=checkpoint?.cursor_ref??"";
 if(!validUtc(cursorAt)||!(cursorRef===""||SHA.test(cursorRef)))
  throw Error("DISCOVERY_CURSOR_CORRUPT");
 const gap=Date.parse(cursorAt)<Date.parse(cutoff);
 if(gap){cursorAt=cutoff;cursorRef="";}
 const until=dateIso(now);
 const result=await env.DB.prepare(sqlFor(lane))
  .bind(cutoff,until,cursorAt,cursorAt,cursorRef).all();
 if(!Array.isArray(result?.results)||result.results.length>LIMIT+1)
  throw Error("DISCOVERY_D1_INVALID_ROWS");
 const items=result.results.slice(0,LIMIT).map(x=>safeRow(lane,x));
 const last=items.at(-1);
 const next=last?{cursor_at:last.first_seen_at,cursor_ref:last.original_ref}:null;
 const proof=await digest(JSON.stringify({lane,cursorAt,cursorRef,next,items}));
 return {schema:DERIVED_DISCOVERY_BRIDGE_SCHEMA,ok:true,
  lane,status:"UNVERIFIED_DISCOVERY_ONLY",rights_verified:false,
  publisher_expression_reused:false,original_text_included:false,
  commercialEligible:false,paidDeliveryAuthorized:false,
  retention_hours:s.retention,coverage_gap_detected:gap,
  checked_at:until,records:items,has_more:result.results.length>LIMIT,
  next_cursor:next,page_sha256:proof};
}
async function commitPage(env,body,now){
 if(!own(body,["schema","lane","page_sha256","next_cursor","reviewed"])||
    body.schema!==DERIVED_DISCOVERY_BRIDGE_SCHEMA||
    !Object.hasOwn(LANES,body.lane)||!SHA.test(body.page_sha256)||
    !Array.isArray(body.reviewed)||body.reviewed.length>LIMIT)
  return response({ok:false,error:"DISCOVERY_ACK_INVALID"},400);
 try{
  const page=await readPage(env,body.lane,now);
  if(page.page_sha256!==body.page_sha256||
     JSON.stringify(page.next_cursor)!==JSON.stringify(body.next_cursor)||
     page.records.length!==body.reviewed.length||!page.next_cursor)
   return response({ok:false,error:"DISCOVERY_ACK_PAGE_STALE"},409);
  const ids=new Set();
  const rows=[];
  for(let i=0;i<page.records.length;i++){
   const r=page.records[i],e=body.reviewed[i];
   if(!own(e,["original_ref","status","commercialEligible"])||
      e.original_ref!==r.original_ref||
      e.status!=="HOLD_SOURCE_ACCESS_OR_EXPRESSION"||
      e.commercialEligible!==false||ids.has(r.original_ref))
    return response({ok:false,error:"DISCOVERY_ACK_RIGHTS_INVALID"},400);
   ids.add(r.original_ref);
   const signalId=await digest(body.lane+"\n"+r.original_ref);
   rows.push([signalId,body.lane,r.original_ref,r.category,r.country_iso3,
    r.observed_clock,r.first_seen_at,r.source_sha]);
  }
  const created=dateIso(now);
  const packed=JSON.stringify(rows);
  const statements=[
   env.DB.prepare(
    "INSERT OR IGNORE INTO derived_risk_gate_discovery_signals("+
    "signal_id,lane,original_ref,category,country_iso3,source_clock_at,"+
    "first_seen_at,source_sha256,rights_state,review_status,created_at) "+
    "SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]'),"+
    "json_extract(value,'$[2]'),json_extract(value,'$[3]'),"+
    "json_extract(value,'$[4]'),json_extract(value,'$[5]'),"+
    "json_extract(value,'$[6]'),json_extract(value,'$[7]'),"+
    "'UNVERIFIED_SOURCE_RIGHTS','HOLD_SOURCE_ACCESS_OR_EXPRESSION',? "+
    "FROM json_each(?)"
   ).bind(created,packed),
   env.DB.prepare(
    "INSERT INTO derived_risk_gate_discovery_cursors"+
    "(lane,cursor_at,cursor_ref,updated_at) VALUES (?,?,?,?) "+
    "ON CONFLICT(lane) DO UPDATE SET cursor_at=excluded.cursor_at,"+
    "cursor_ref=excluded.cursor_ref,updated_at=excluded.updated_at "+
    "WHERE derived_risk_gate_discovery_cursors.cursor_at < excluded.cursor_at "+
    "OR (derived_risk_gate_discovery_cursors.cursor_at=excluded.cursor_at "+
    "AND derived_risk_gate_discovery_cursors.cursor_ref<=excluded.cursor_ref)"
   ).bind(body.lane,page.next_cursor.cursor_at,page.next_cursor.cursor_ref,created),
  ];
  const applied=await env.DB.batch(statements);
  if(!Array.isArray(applied)||applied.some(x=>x?.success===false))
   throw Error("DISCOVERY_D1_ATOMIC_WRITE_FAILED");
  const [stored,cursor]=await Promise.all([
   env.DB.prepare("SELECT signal_id,lane,original_ref,category,country_iso3,"+
    "source_clock_at,first_seen_at,source_sha256,rights_state,review_status "+
    "FROM derived_risk_gate_discovery_signals WHERE signal_id IN "+
    "(SELECT json_extract(value,'$[0]') FROM json_each(?))").bind(packed).all(),
   env.DB.prepare("SELECT cursor_at,cursor_ref FROM "+
    "derived_risk_gate_discovery_cursors WHERE lane=?").bind(body.lane).first(),
  ]);
  if(!Array.isArray(stored?.results)||stored.results.length!==rows.length||
     cursor?.cursor_at!==page.next_cursor.cursor_at||
     cursor?.cursor_ref!==page.next_cursor.cursor_ref||
     rows.some(x=>!stored.results.some(r=>r.signal_id===x[0]&&r.lane===x[1]&&
      r.original_ref===x[2]&&r.category===x[3]&&
      (r.country_iso3??null)===(x[4]??null)&&r.source_clock_at===x[5]&&
      r.first_seen_at===x[6]&&r.source_sha256===x[7]&&
      r.rights_state==="UNVERIFIED_SOURCE_RIGHTS"&&
      r.review_status==="HOLD_SOURCE_ACCESS_OR_EXPRESSION")))
   throw Error("DISCOVERY_D1_READBACK_MISMATCH");
  return response({ok:true,schema:DERIVED_DISCOVERY_BRIDGE_SCHEMA,lane:body.lane,
   admitted:rows.length,d1_atomic_readback_verified:true,
   cursor_advanced:true,commercialEligible:false,paidDeliveryAuthorized:false,
   original_text_stored:false,finished_page:true});
 }catch{
  return response({ok:false,error:"DISCOVERY_D1_WRITE_OR_READBACK_UNAVAILABLE"},503);
 }
}
async function pendingQueue(env,query){
 const offsetRaw=query.get("offset")??"0";
 const offset=Number(offsetRaw);
 if([...query.keys()].some(k=>!["view","offset"].includes(k))||
    !/^(0|[1-9][0-9]*)$/u.test(offsetRaw)||
    !Number.isSafeInteger(offset)||offset>10000||offset%100!==0)
  return response({ok:false,error:"DISCOVERY_QUEUE_QUERY_INVALID"},400);
 try{
  const data=await env.DB.prepare(
   "SELECT signal_id,lane,category,country_iso3,source_clock_at,"+
   "first_seen_at,source_sha256,rights_state,review_status "+
   "FROM derived_risk_gate_discovery_signals "+
   "WHERE first_seen_at>=? ORDER BY first_seen_at DESC,signal_id DESC "+
   "LIMIT 101 OFFSET ?"
  ).bind(dateIso(Date.now()-72*3600000),offset).all();
  if(!Array.isArray(data?.results))throw Error("DISCOVERY_QUEUE_BAD_READ");
  return response({ok:true,schema:DERIVED_DISCOVERY_BRIDGE_SCHEMA,
   scope:"PROTECTED_UNVERIFIED_DISCOVERY_ONLY",
   original_article_reused:false,commercialEligible:false,
   records:data.results.slice(0,100),has_more:data.results.length>100,
   next_offset:data.results.length>100?offset+100:null});
 }catch{return response({ok:false,error:"DISCOVERY_QUEUE_UNAVAILABLE"},503);}
}
export async function handleDerivedRiskGateDiscovery(request,env,now=Date.now()){
 if(!env?.DB?.prepare||!Number.isFinite(now))
  return response({ok:false,error:"DISCOVERY_D1_UNAVAILABLE"},503);
 const url=new URL(request.url);
 if(request.method==="GET"&&url.searchParams.get("view")==="pending")
  return pendingQueue(env,url.searchParams);
 if(request.method==="GET"){
  if(url.searchParams.size!==1||
     url.searchParams.getAll("lane").length!==1||
     !Object.hasOwn(LANES,url.searchParams.get("lane")))
   return response({ok:false,error:"DISCOVERY_LANE_INVALID"},400);
  try{return response(await readPage(env,url.searchParams.get("lane"),now));}
  catch{return response({ok:false,error:"DISCOVERY_D1_READ_UNAVAILABLE"},503);}
 }
 if(request.method==="POST"&&!url.search){
  try{
   const raw=await request.text();
   if(raw.length>17000)return response({ok:false,error:"DISCOVERY_ACK_TOO_LARGE"},400);
   return commitPage(env,JSON.parse(raw),now);
  }catch{return response({ok:false,error:"DISCOVERY_ACK_INVALID"},400);}
 }
 return response({ok:false,error:"DISCOVERY_METHOD_NOT_ALLOWED"},405);
}
