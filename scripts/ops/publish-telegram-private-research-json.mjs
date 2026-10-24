#!/usr/bin/env node
/**
 * AFTER authenticated B2 SHA readback and exact D1 durable handoff/ACK,
 * project consent-scoped Telegram metadata as PRIVATE research JSON.
 * No source body, Telegram handle, headline or news/paid product is emitted.
 */
import {readFileSync,realpathSync,lstatSync} from "node:fs";
import {resolve,dirname,basename} from "node:path";
import {execFileSync} from "node:child_process";
import {pathToFileURL} from "node:url";

const ID=/^tg_[a-f0-9]{32}_[a-f0-9]{16}$/u;
const SHA=/^[a-f0-9]{64}$/u;
const CATEGORIES={GEOPOLITICS:"geopolitics",MACRO:"macro",CRITICAL_MINERALS:"rare_earth"};
const WINDOW=72*3600000;
const CONFIG="workers/control-plane/wrangler.runtime.jsonc";
function assert(ok,reason){if(!ok)throw Error(reason)}
const sql=x=>"'"+x.replaceAll("'","''")+"'";
export function verifyAuthorizedTelegramResearchLead(entry,payload,now=new Date()){
 assert(Number.isFinite(now.getTime())&&entry&&payload&&
  typeof entry==="object"&&typeof payload==="object","TELEGRAM_RESEARCH_BAD_INPUT");
 assert(ID.test(entry.delivery_id)&&
  /^tg_[a-f0-9]{32}$/u.test(entry.signal_id)&&
  entry.delivery_id.startsWith(entry.signal_id+"_")&&
  SHA.test(entry.b2_sha256)&&
  entry.delivery_id.endsWith(entry.b2_sha256.slice(0,16)),"TELEGRAM_RESEARCH_B2_ID_INVALID");
 assert(entry.queue_state==="PENDING"&&entry.verification_status==="UNVERIFIED"&&
  entry.scoring_eligible===false&&entry.commercial_eligible===false,
  "TELEGRAM_RESEARCH_UNVERIFIED_REQUIRED");
 assert(payload.source_id==="telegram_authorized_publisher_feed"&&
  payload.source_url===null&&payload.raw_payload===null&&
  payload.headline==="TELEGRAM_LEAD_METADATA_ONLY"&&
  payload.verification_status==="UNVERIFIED"&&
  payload.source_channel_key===entry.source_channel_key&&
  String(payload.source_record_id)===String(entry.source_record_id)&&
  payload.published_at===entry.published_at,
  "TELEGRAM_RESEARCH_SANITIZED_BOUNDARY_INVALID");
 const category=CATEGORIES[payload.signal_category];
 assert(Boolean(category),"TELEGRAM_RESEARCH_CATEGORY_INVALID");
 const country=payload.country_iso3??null;
 assert(country===null||(typeof country==="string"&&/^[A-Z]{3}$/u.test(country)),
  "TELEGRAM_RESEARCH_COUNTRY_INVALID");
 const at=Date.parse(payload.published_at);
 assert(Number.isFinite(at)&&at<=now.getTime()&&at>=now.getTime()-WINDOW,
  "TELEGRAM_RESEARCH_STALE_OR_FUTURE");
 return Object.freeze({delivery_id:entry.delivery_id,category,country_iso3:country,
  published_at:new Date(at).toISOString()});
}
export function authorizedTelegramResearchSql(row,now=new Date()){
 assert(ID.test(row.delivery_id)&&Object.values(CATEGORIES).includes(row.category)&&
   (row.country_iso3===null||/^[A-Z]{3}$/u.test(row.country_iso3))&&
   Number.isFinite(Date.parse(row.published_at))&&Number.isFinite(now.getTime()),
   "TELEGRAM_RESEARCH_SQL_ROW_INVALID");
 const id=sql(row.delivery_id),country=row.country_iso3?sql(row.country_iso3):"NULL";
 return "INSERT OR IGNORE INTO telegram_research_json "+
   "(delivery_id,category,country_iso3,published_at,accepted_at) "+
   "SELECT l.delivery_id,"+sql(row.category)+","+country+",l.published_at,"+sql(now.toISOString())+" "+
   "FROM telegram_private_unverified_leads l "+
   "JOIN telegram_signal_lead_queue q ON q.delivery_id=l.delivery_id "+
   "WHERE l.delivery_id="+id+" AND q.state='CONSUMED' "+
   "AND l.published_at="+sql(row.published_at)+" "+
   "AND l.verification_status='UNVERIFIED' "+
   "AND l.scoring_eligible=0 AND l.commercial_eligible=0 "+
   "AND q.b2_sha256=l.b2_sha256 AND q.source_channel_key=l.source_channel_key;";
}
function rows(raw){
 const data=JSON.parse(raw);
 return (Array.isArray(data)?data:[data]).flatMap(x=>Array.isArray(x?.results)?x.results:[]);
}
function executeD1(statement){
 assert(process.env.D1_CONFIG===CONFIG&&
  process.env.D1_DATABASE_NAME==="geomacro-control-plane"&&
  process.env.B2_ACCOUNT_QUOTA_REQUIRED==="1"&&
  Boolean(process.env.CLOUDFLARE_API_TOKEN)&&Boolean(process.env.CLOUDFLARE_ACCOUNT_ID),
  "TELEGRAM_RESEARCH_PRODUCTION_CONFIG_REQUIRED");
 const output=execFileSync("npx",["-y","wrangler@4.136.3","d1","execute","DB",
   "--remote","--json","--config",CONFIG,"--command",statement],{
   timeout:45000,maxBuffer:512*1024,encoding:"utf8",stdio:["ignore","pipe","pipe"]});
 return rows(output);
}
export function fromAuthorizedSummary(file,now=new Date()){
 const path=realpathSync(file);
 assert(!lstatSync(file).isSymbolicLink()&&basename(path)==="summary.json",
   "TELEGRAM_RESEARCH_SUMMARY_PATH_INVALID");
 const summary=JSON.parse(readFileSync(path,"utf8"));
 assert(summary.schema==="geomacro.telegram-drain-proof.v2"&&
   Array.isArray(summary.accepted)&&summary.accepted.length<=4&&
   summary.verified_objects===summary.accepted.length,"TELEGRAM_RESEARCH_SUMMARY_INVALID");
 const root=dirname(path),seen=new Set();
 return summary.accepted.map(entry=>{
   const payloadPath=resolve(String(entry.payload_file??""));
   assert(!lstatSync(payloadPath).isSymbolicLink()&&dirname(payloadPath)===root&&
     basename(payloadPath)===entry.delivery_id+".json"&&
     realpathSync(payloadPath)===payloadPath&&!seen.has(entry.delivery_id),
     "TELEGRAM_RESEARCH_PAYLOAD_PATH_INVALID");
   seen.add(entry.delivery_id);
   const raw=readFileSync(payloadPath,"utf8");
   assert(Buffer.byteLength(raw)<4096,"TELEGRAM_RESEARCH_PAYLOAD_TOO_LARGE");
   return verifyAuthorizedTelegramResearchLead(entry,JSON.parse(raw),now);
 });
}
export async function publishTelegramPrivateResearch(summaryPath,now=new Date()){
 const leads=fromAuthorizedSummary(summaryPath,now);
 let accepted=0;
 for(const row of leads){
   executeD1(authorizedTelegramResearchSql(row,now));
   const readback=executeD1("SELECT delivery_id,category,country_iso3,published_at,"+
     "verification_status,scoring_eligible,commercial_eligible "+
     "FROM telegram_research_json WHERE delivery_id="+sql(row.delivery_id)+" LIMIT 2;");
   assert(readback.length===1&&
     readback[0].delivery_id===row.delivery_id&&
     readback[0].category===row.category&&
     readback[0].country_iso3===row.country_iso3&&
     readback[0].published_at===row.published_at&&
     readback[0].verification_status==="UNVERIFIED"&&
     Number(readback[0].scoring_eligible)===0&&
     Number(readback[0].commercial_eligible)===0,"TELEGRAM_RESEARCH_D1_READBACK_FAILED");
   accepted++;
 }
 executeD1("DELETE FROM telegram_research_json WHERE published_at < datetime('now','-72 hours');");
 executeD1("DELETE FROM telegram_research_json WHERE delivery_id NOT IN "+
   "(SELECT delivery_id FROM telegram_research_json ORDER BY published_at DESC,delivery_id DESC LIMIT 300);");
 return {schema:"geomacro.telegram-research-json-production-ack.v1",
   accepted,d1_readback_verified:true,
   raw_telegram_content_stored:false,
   independent_original_verified:false,commercial_product_authorized:false,x402_charges:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
   const a=process.argv.slice(2);
   assert(a.length===2&&a[0]==="--summary","TELEGRAM_RESEARCH_CLI_INVALID");
   console.log(JSON.stringify(await publishTelegramPrivateResearch(a[1])));
 }catch{
   console.error(JSON.stringify({ok:false,error:"TELEGRAM_RESEARCH_RESTRICTED_D1_PUBLISH_FAILED_CLOSED"}));
   process.exitCode=1;
 }
}
