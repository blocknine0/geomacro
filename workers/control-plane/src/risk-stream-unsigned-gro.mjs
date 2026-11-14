/**
 * Append-only unsigned analytical GRO records for live Hot50 news.
 * This is the first research stage only: no signature, source licence,
 * commercial delivery, charge or execution authority is created here.
 */
import {makeDailyNewsGro} from "./risk-stream-news-gro.mjs";

const TIERS=Object.freeze(["basic_focused","standard","complex_full"]);
const HEX=/^[a-f0-9]{64}$/u;
const iso=n=>new Date(n).toISOString();
const day=n=>iso(n).slice(0,10);
const hash=async value=>{
 const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",
  new TextEncoder().encode(value)));
 return [...bytes].map(x=>x.toString(16).padStart(2,"0")).join("");
};
const fail=code=>{throw Error("HOT50_UNSIGNED_GRO_"+code)};
const safeAnalysisText=(value,fallback)=>
 typeof value==="string"&&value.trim().length>=6&&value.trim().length<=360&&
 !/https?:\/\/|<[^>]+>|[\r\n]/iu.test(value)?value.trim():fallback;;

export async function makeUnsignedDailyNewsGro(signal,tier,{now=Date.now()}={}){
 if(!Number.isSafeInteger(now)||!TIERS.includes(tier))fail("INPUT_INVALID");
 const source=await makeDailyNewsGro(signal,tier,{now});
 const payload={...source.payload,
  schema:"geomacro.hot50-news-unsigned-gro.v1",
  product_type:"NEWS_ANALYSIS_RISK_GATE",
  analysis_basis:"NEWS_SIGNAL_NOT_MARKET_PRICE_OR_VERIFIED_COUNTRY_RISK",
  news_analysis_only:true,
  news_analysis:{
   what:safeAnalysisText(signal?.derived?.what,
    `A fresh ${payload.category} news signal was observed for ${payload.country_iso3}; publisher text is not included.`),
   why:safeAnalysisText(signal?.derived?.why,
    "Potential relevance depends on independent confirmation and the affected exposure."),
   market:safeAnalysisText(signal?.derived?.market,payload.assessment.market_relevance),
   watch:safeAnalysisText(signal?.derived?.watch,payload.assessment.watch),
   evidence:{status:payload.evidence_status,
    interpretation:payload.evidence_status==="UNVERIFIED_SIGNAL"?
     "Unverified signal only; no corroborated event or measured country risk is asserted.":
     payload.evidence_status==="DUAL_ATTESTED_ORIGINAL"?
     "Dual-attested original exists; independent event corroboration remains required.":
     "Internal corroboration exists; this record remains unsigned and noncommercial.",
    publisher_content_included:false,verified_country_risk:false}
  },
  signed:false,signature_status:"UNSIGNED",
  source_rights_verified:false,
  customer_delivery_authorized:false,
  commercial_sale_authorized:false,
  commercial_eligibility:"UNREVIEWED_RESEARCH_ONLY",
  raw_source_disclosed:false,raw_upstream_text_included:false,
  original_publisher_text_included:false,
  execution_authorized:false,certified_risk_index:false,billable:false
 };
 // Do not imply that this unsigned research object is a commercial license or
 // quote. The per-tier market price belongs only to the separate paid route.
 delete payload.customer_price_usdc;
 delete payload.license;
 const payload_json=JSON.stringify(payload);
 return {gro_id:source.gro_id,country_iso3:payload.country_iso3,
  category:payload.category,day_utc:payload.day_utc,
  event_fingerprint:payload.event_fingerprint,tier,
  evidence_status:payload.evidence_status,payload_json,
  payload_sha256:await hash(payload_json),generated_at:payload.generated_at,
  expires_at:payload.expires_at};
}
async function validStored(row,expected){
 if(!row||row.gro_id!==expected.gro_id||row.country_iso3!==expected.country_iso3||
    row.category!==expected.category||row.day_utc!==expected.day_utc||
    row.event_fingerprint!==expected.event_fingerprint||row.tier!==expected.tier||
    row.evidence_status!==expected.evidence_status||
    row.signature_status!=="UNSIGNED"||row.commercial_sale_authorized!==0||
    row.source_rights_verified!==0||row.raw_source_disclosed!==0||
    row.execution_authorized!==0)return false;
 if(typeof row.payload_json!=="string"||row.payload_json.length>18000||
    !HEX.test(row.payload_sha256??""))return false;
 if(await hash(row.payload_json)!==row.payload_sha256)return false;
 let p;try{p=JSON.parse(row.payload_json)}catch{return false}
 const allowlist=["analysis_basis","assessment","billable","category","certified_risk_index",
  "commercial_eligibility","commercial_sale_authorized","country_iso3",
  "customer_delivery_authorized","day_utc","event_class","event_fingerprint",
  "evidence_corroborated","evidence_status","execution_authorized","expires_at",
  "generated_at","intelligence_owner","issuer","news_analysis",
  "news_analysis_only","original_publisher_text_included","product_type","raw_source_disclosed","raw_upstream_text_included","schema","signature_status",
  "signed","source_rights_verified","tier","tier_status"].sort();
 return Object.keys(p).sort().join("|")===allowlist.join("|")&&
  p.schema==="geomacro.hot50-news-unsigned-gro.v1"&&
  p.product_type==="NEWS_ANALYSIS_RISK_GATE"&&
  p.analysis_basis==="NEWS_SIGNAL_NOT_MARKET_PRICE_OR_VERIFIED_COUNTRY_RISK"&&
  p.news_analysis_only===true&&p.signed===false&&p.signature_status==="UNSIGNED"&&
  p.news_analysis&&typeof p.news_analysis.what==="string"&&
  typeof p.news_analysis.why==="string"&&typeof p.news_analysis.market==="string"&&
  typeof p.news_analysis.watch==="string"&&
  p.news_analysis.evidence?.status===p.evidence_status&&
  p.news_analysis.evidence?.publisher_content_included===false&&
  p.news_analysis.evidence?.verified_country_risk===false&&!Object.hasOwn(p,"signature_b64")&&
  !Object.hasOwn(p,"signing_key_id")&&!Object.hasOwn(p,"signature")&&
  p.gro_id===undefined&&p.country_iso3===expected.country_iso3&&
  p.category===expected.category&&p.day_utc===expected.day_utc&&
  p.event_fingerprint===expected.event_fingerprint&&p.tier===expected.tier&&
  p.evidence_status===expected.evidence_status&&
  p.generated_at===row.generated_at&&p.expires_at===row.expires_at&&
  p.commercial_sale_authorized===false&&p.source_rights_verified===false&&
  p.customer_delivery_authorized===false&&p.billable===false&&
  p.execution_authorized===false&&p.raw_source_disclosed===false&&
  p.raw_upstream_text_included===false&&p.original_publisher_text_included===false&&
  !Object.hasOwn(p,"customer_price_usdc")&&!Object.hasOwn(p,"license");
}

/** One queue batch of at most ten events becomes three immutable tier objects
 * per event. Concurrent retries converge on the first valid append-only row.
 */
export async function issueUnsignedDailyNewsBatch(env,signals,{
 now=Date.now(),limit=10
}={}){
 if(env?.RISK_STREAM_HOT50_AUTONOMOUS_ENABLED!=="1")
  return {status:"UNSIGNED_GRO_AUTOMATION_HELD",created:0,idempotent:0};
 if(!env?.DB?.prepare||!env?.DB?.batch||
    !Array.isArray(signals)||!Number.isInteger(limit)||limit<1||limit>10||
    signals.length>limit||!Number.isSafeInteger(now))
  fail("BATCH_INVALID");
 const unique=new Map();
 for(const signal of signals){
  // makeDailyNewsGro enforces Hot50 membership, category and genuine current
  // publisher clock. Global search index leads remain explicitly unverified.
  const preview=await makeDailyNewsGro(signal,"basic_focused",{now});
  const key=[preview.payload.country_iso3,preview.payload.category,
   preview.payload.event_fingerprint,preview.payload.evidence_status].join("|");
  unique.set(key,signal);
 }
 const records=[];
 for(const signal of unique.values())
  for(const tier of TIERS)
   records.push(await makeUnsignedDailyNewsGro(signal,tier,{now}));
 if(records.length>30)fail("BATCH_LIMIT");
 const inserts=[];
 let alreadyPresent=0,created=0;
 for(const row of records){
  const prior=await env.DB.prepare(
   "SELECT * FROM risk_stream_unsigned_news_gro WHERE gro_id=? LIMIT 1"
  ).bind(row.gro_id).first();
  if(prior){
   if(!await validStored(prior,row))fail("EXISTING_ROW_INVALID");
   alreadyPresent++;
   continue;
  }
  inserts.push(env.DB.prepare(
   "INSERT OR IGNORE INTO risk_stream_unsigned_news_gro "+
   "(gro_id,country_iso3,category,day_utc,event_fingerprint,tier,evidence_status,"+
   "payload_json,payload_sha256,signature_status,generated_at,expires_at,"+
   "commercial_sale_authorized,source_rights_verified,raw_source_disclosed,"+
   "execution_authorized) VALUES (?,?,?,?,?,?,?,?,?,'UNSIGNED',?,?,0,0,0,0)"
  ).bind(row.gro_id,row.country_iso3,row.category,row.day_utc,
   row.event_fingerprint,row.tier,row.evidence_status,row.payload_json,
   row.payload_sha256,row.generated_at,row.expires_at));
 }
 if(inserts.length){
  const result=await env.DB.batch(inserts);
  if(!Array.isArray(result)||result.length!==inserts.length||
     result.some(x=>x?.success===false))fail("D1_BATCH_UNVERIFIED");
  for(const item of result){
   const changes=item?.meta?.changes;
   if(!Number.isSafeInteger(changes)||changes<0||changes>1)
    fail("D1_CHANGE_COUNT_UNVERIFIED");
   created+=changes;
  }
 }
 const ids=records.map(x=>x.gro_id);
 const response=await env.DB.prepare(
  "SELECT * FROM risk_stream_unsigned_news_gro WHERE gro_id IN "+
  "(SELECT value FROM json_each(?))"
 ).bind(JSON.stringify(ids)).all();
 if(!Array.isArray(response?.results)||response.results.length!==records.length)
  fail("D1_READBACK_INCOMPLETE");
 const byId=new Map(response.results.map(x=>[x.gro_id,x]));
 for(const row of records)
  if(!await validStored(byId.get(row.gro_id),row))fail("D1_READBACK_INVALID");
 const idempotent=records.length-created;
 if(idempotent<alreadyPresent)fail("IDEMPOTENCY_CENSUS_INVALID");
 return {schema:"geomacro.hot50-unsigned-news-gro-issuance.v1",
  status:"UNSIGNED_GRO_D1_READBACK_PASS",events:unique.size,created,idempotent,
  tiers:TIERS,signature_created:false,commercial_sale_authorized:false,
  customer_delivery_authorized:false,source_rights_verified:false,
  raw_source_disclosed:false,execution_authorized:false};
}

/** Keep the unsigned D1 working set bounded while preserving the full
 * seven-day evidence window required by later signed tiers. Runs once daily
 * on the existing Worker cron and deletes at most 1,000 expired rows.
 */
export async function pruneUnsignedDailyNewsGros(env,now=Date.now()){
 if(!Number.isSafeInteger(now)||!env?.DB?.prepare)fail("PRUNE_INPUT_INVALID");
 const date=new Date(now);
 if(date.getUTCHours()!==0||date.getUTCMinutes()!==5)return 0;
 const cutoff=iso(now-8*86400000);
 const result=await env.DB.prepare(
  "DELETE FROM risk_stream_unsigned_news_gro WHERE gro_id IN "+
  "(SELECT gro_id FROM risk_stream_unsigned_news_gro WHERE generated_at<? "+
  "ORDER BY generated_at,gro_id LIMIT ?)"
 ).bind(cutoff,1000).run();
 const changes=result?.meta?.changes??result?.changes;
 if(!Number.isSafeInteger(changes)||changes<0||changes>1000)
  fail("PRUNE_CHANGE_COUNT_UNVERIFIED");
 return changes;
}

export async function readUnsignedDailyNewsGros(request,env,now=Date.now()){
 const bad=(error,status=400)=>Response.json({ok:false,error},{status});
 if(request.method!=="GET"||!env?.DB?.prepare)return bad("UNSIGNED_GRO_READ_UNAVAILABLE",503);
 const url=new URL(request.url);
 if([...url.searchParams.keys()].some(k=>
   !["country_iso3","category","tier","limit"].includes(k)))
  return bad("UNSIGNED_GRO_QUERY_INVALID");
 const country=url.searchParams.get("country_iso3");
 const category=url.searchParams.get("category");
 const tier=url.searchParams.get("tier");
 const raw=url.searchParams.get("limit")??"30",limit=Number(raw);
 if((country!==null&&!/^[A-Z]{3}$/u.test(country))||
    (category!==null&&!["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"].includes(category))||
    (tier!==null&&!TIERS.includes(tier))||
    !/^(?:[1-9]|[1-2][0-9]|30)$/u.test(raw)||limit>30)
  return bad("UNSIGNED_GRO_QUERY_INVALID");
 try{
  const clauses=["day_utc=?","expires_at>?","signature_status='UNSIGNED'",
   "commercial_sale_authorized=0","source_rights_verified=0","raw_source_disclosed=0",
   "execution_authorized=0"];
  const binds=[day(now),iso(now)];
  if(country){clauses.push("country_iso3=?");binds.push(country)}
  if(category){clauses.push("category=?");binds.push(category)}
  if(tier){clauses.push("tier=?");binds.push(tier)}
  binds.push(limit);
  const sql="SELECT * FROM risk_stream_unsigned_news_gro WHERE "+clauses.join(" AND ")+
   " ORDER BY generated_at DESC,gro_id DESC LIMIT ?";
  const result=await env.DB.prepare(sql).bind(...binds).all();
  if(!Array.isArray(result?.results)||result.results.length>limit)
   return bad("UNSIGNED_GRO_READBACK_INVALID",503);
  const items=[];
  for(const row of result.results){
   const expected=row;
   if(!await validStored(row,expected))return bad("UNSIGNED_GRO_ROW_INVALID",503);
   items.push({gro_id:row.gro_id,payload:JSON.parse(row.payload_json),
    payload_sha256:row.payload_sha256,signature_status:"UNSIGNED"});
  }
  return Response.json({ok:true,schema:"geomacro.hot50-unsigned-news-gro-readback.v1",
   signature_created:false,commercial_sale_authorized:false,items});
 }catch{return bad("UNSIGNED_GRO_PROVIDER_READBACK_UNAVAILABLE",503)}
}
