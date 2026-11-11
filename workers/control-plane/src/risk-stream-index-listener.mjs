/**
 * Scoped, untrusted 24/7 stream lead receiver.
 * Receives ONLY metadata from separately authenticated RSS/GDELT/private OSINT
 * producers; registers D1 FK as DISABLED, RIGHTS_UNAPPROVED. Not a GRO signer.
 */
import {isHot50RiskCountry} from "./risk-gate-hot50-scope.mjs";
import {enqueueRiskStreamEvents} from "./risk-stream-pipeline.mjs";
const ROLES={GEOPOLITICS:"GOVERNMENT_WIRE",
 MACRO_FX:"OFFICIAL_STATISTICS",CRITICAL_MINERALS:"TRADE_CUSTOMS"};
const CAT={geopolitics:"GEOPOLITICS",macro:"MACRO_FX",minerals:"CRITICAL_MINERALS",
 GEOPOLITICS:"GEOPOLITICS",MACRO_FX:"MACRO_FX",CRITICAL_MINERALS:"CRITICAL_MINERALS"};
const TYPES=new Set(["SANCTIONS","WAR","BAN","DEBT","POLICY","TRADE","INFLATION","EXPORT_CONTROL"]);
const enc=new TextEncoder(),iso=x=>new Date(x).toISOString();
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(s))),
 b=>b.toString(16).padStart(2,"0")).join("");
const error=x=>{throw Error("RISK_STREAM_INDEX_"+x)};
const stamp=(s,now)=>{
 const v=Date.parse(s??"");
 return Number.isFinite(v)&&v<=now+60000&&now-v<=72*3600000?iso(v):null;
};
const origin=url=>{
 try{
  const u=new URL(url);
  if(u.protocol!=="https:"||u.username||u.password||u.port||u.hash||
     u.hostname.endsWith(".local")||u.hostname.endsWith(".test")||
     u.hostname.endsWith(".invalid")||
     !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/iu.test(u.hostname))return null;
  return {host:u.hostname.toLowerCase().replace(/^www\./u,""),url:u.href};
 }catch{return null}
};
export async function canonicalUntrustedIndexLead(e,{now=Date.now()}={}){
 const country=e?.country_iso3,category=CAT[e?.category];
 const eventType=e?.event_type;
 const direct=origin(e?.source_url);
 const native=stamp(e?.published_at,now);
 if(!isHot50RiskCountry(country)||!category||!native||!direct||
    !TYPES.has(eventType)||
    typeof e?.source_record_id!=="string"||e.source_record_id.length<3||
    e.source_record_id.length>500||
    !["RSS","GDELT_INDEX","PRIVATE_OSINT","AUTOMATED_SEARCH"].includes(e.source))
  error("LEAD_COUNTRY_CATEGORY_OR_SOURCE_INVALID");
 const recordHash=await hash(e.source+"\n"+e.source_record_id+"\n"+country);
 const eventKey="INDEX_"+recordHash.slice(0,40).toUpperCase();
 const entities=["COUNTRY:"+country,"EVENT:"+recordHash.slice(0,12).toUpperCase()].sort();
 const id="untrusted_"+(await hash(e.source+"\n"+direct.host+"\n"+category)).slice(0,48);
 const fingerprint=await hash(JSON.stringify([country,category,eventKey,entities]));
 const role=ROLES[category];
 const label=eventType.replaceAll("_"," ").toLowerCase();
 return {
  schema:"geomacro.risk-stream-candidate.v1",kind:"INDEX_ONLY",
  country_iso3:country,category,feed_origin:e.source==="GDELT_INDEX"?"GDELT_INDEX":
   e.source==="RSS"?"RSS":"WEBSITE_INTELLIGENCE",
  event_key:eventKey,event_fingerprint:fingerprint,entities,
  source_id:id,source_url:direct.url,
  publisher_root_domain:direct.host,parent_media_entity:"untrusted_"+
   (await hash(direct.host)).slice(0,24),source_role:role,
  published_at:native,
  original_page_sha256:await hash("UNVERIFIED_INDEX_ONLY\n"+recordHash),
  derived:{
   what:"Unverified "+label+" event signal reported for "+country,
   why:"Source lead requires original-issuer and factual review",
   market:"Market impact has not been verified or quantified",
   watch:"Monitor original publishers for corroboration and corrections"
  },raw_payload:null,proof:null
 };
}
async function registerIndexSources(db,items,{now=Date.now()}={}){
 if(!db?.prepare||!db.batch||items.length<1||items.length>10)
  error("FK_REGISTRATION_INVALID");
 const byId=new Map();
 for(const e of items){
  const previous=byId.get(e.source_id);
  const key=[e.publisher_root_domain,e.parent_media_entity,e.source_role].join("|");
  if(previous&&previous!==key)error("INDEX_SOURCE_CONFLICT");
  byId.set(e.source_id,key);
 }
 const rows=[...new Map(items.map(e=>[e.source_id,e])).values()];
 const inserts=rows.map(()=>" (?,?,?,?,0,0,?,NULL)").join(",");
 const vals=rows.flatMap(e=>[e.source_id,e.publisher_root_domain,
  e.parent_media_entity,e.source_role,iso(now)]);
 const stmt=db.prepare("INSERT OR IGNORE INTO risk_stream_sources "+
  "(source_id,publisher_root_domain,parent_media_entity,source_role,"+
  "commercial_rights_approved,enabled,reviewed_at,rights_expire_at) VALUES"+inserts)
  .bind(...vals);
 const out=await db.batch([stmt]);
 if(!Array.isArray(out)||out[0]?.success!==true)error("INDEX_SOURCE_D1_WRITE_FAILED");
 const read=await db.prepare("SELECT source_id,publisher_root_domain,"+
  "parent_media_entity,source_role,commercial_rights_approved,enabled "+
  "FROM risk_stream_sources WHERE source_id IN (SELECT value FROM json_each(?))")
  .bind(JSON.stringify(rows.map(x=>x.source_id))).all();
 const actual=new Map((read?.results??[]).map(x=>[x.source_id,x]));
 for(const e of rows){
  const r=actual.get(e.source_id);
  if(!r||r.publisher_root_domain!==e.publisher_root_domain||
     r.parent_media_entity!==e.parent_media_entity||r.source_role!==e.source_role||
     ![0,1].includes(r.enabled)||![0,1].includes(r.commercial_rights_approved))
   error("INDEX_SOURCE_READBACK_FAILED");
 }
 return {registered:rows.length,rights_authorized_by_registration:false};
}
export async function acceptScopedUntrustedRiskStreamLeads(request,env,{now=Date.now()}={}){
 const secret=env?.RISK_STREAM_INDEX_LEAD_BEARER;
 if(typeof secret!=="string"||secret.length<48)
  return Response.json({ok:false,error:"RISK_STREAM_INDEX_TOKEN_NOT_CONFIGURED"},{status:503});
 const supplied=request.headers.get("Authorization")??"";
 // Compare only fixed-length digests of bearer values.
 const expected=await hash("Bearer "+secret),actual=await hash(supplied);
 if(expected!==actual)
  return Response.json({ok:false,error:"RISK_STREAM_INDEX_FORBIDDEN"},{status:403});
 let value;
 try{
  const text=await request.text();
  if(enc.encode(text).length>64000)error("REQUEST_TOO_LARGE");
  value=JSON.parse(text);
  if(value?.schema!=="geomacro.risk-stream-untrusted-leads.v1"||
     !Array.isArray(value.items)||value.items.length<1||value.items.length>10)
   error("REQUEST_INVALID");
  const candidates=[];
  for(const x of value.items)candidates.push(await canonicalUntrustedIndexLead(x,{now}));
  await registerIndexSources(env.DB,candidates,{now});
  const ack=await enqueueRiskStreamEvents(env,{
   schema:"geomacro.risk-stream-ingest-batch.v1",items:candidates
  },now);
  const payload=await ack.json();
  if(ack.status!==202||payload.accepted!==candidates.length)
   error("QUEUE_DURABLE_ACK_MISSING");
  return Response.json({
   schema:"geomacro.risk-stream-untrusted-queue-ack.v1",
   status:"DURABLY_QUEUED_INDEX_ONLY",
   accepted:candidates.length,original_publications_verified:0,
   commercial_delivery_authorized:false,paid_delivery:false
  },{status:202});
 }catch(errorValue){
  return Response.json({ok:false,error:String(errorValue?.message??"RISK_STREAM_INDEX_HELD")
   .slice(0,100)},{status:503});
 }
}
