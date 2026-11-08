#!/usr/bin/env node
/**
 * Native provider-billed rows_read/rows_written test on a dedicated Cloudflare
 * D1 SHADOW DATABASE, never GeoMacro's canonical production D1.
 * Real observations come exclusively from result[0].meta returned by D1 REST.
 * No sqlite VM steps, estimate, EXPLAIN or number of SQL calls is substituted.
 *
 * Invocation:
 *   node scripts/ops/verify-d1-publisher-billable-shadow.mjs --dry-run
 *   GEOMACRO_D1_SHADOW_TARGET_APPROVED=YES \
 *   GEOMACRO_D1_SHADOW_DATABASE_ID=<shadow-uuid> D1_DATABASE_ID=<prod-uuid> \
 *   CLOUDFLARE_ACCOUNT_ID=<account> CLOUDFLARE_API_TOKEN=<token> \
 *   node scripts/ops/verify-d1-publisher-billable-shadow.mjs --run-shadow
 */
import {createHash,randomUUID} from "node:crypto";
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ACCOUNT=/^[a-f0-9]{32}$/iu;
const sha=text=>createHash("sha256").update(text).digest("hex");
const error=code=>{throw Error("D1_SHADOW_"+code)};
const REPORT="artifacts/release/d1-publisher-shadow-billable-rows.json";
export const BULK_SQL=
 "INSERT INTO website_derived_intelligence "+
 "(id,category,published_at,date_precision,story_json,first_seen_at) "+
 "SELECT json_extract(j.value,'$[0]'),json_extract(j.value,'$[1]'),"+
 "json_extract(j.value,'$[2]'),json_extract(j.value,'$[3]'),"+
 "json_extract(j.value,'$[4]'),json_extract(j.value,'$[5]') "+
 "FROM json_each(?) AS j WHERE 1 "+
 "ON CONFLICT(id) DO UPDATE SET story_json=excluded.story_json "+
 "WHERE website_derived_intelligence.category=excluded.category "+
 "AND website_derived_intelligence.published_at=excluded.published_at "+
 "AND website_derived_intelligence.date_precision=excluded.date_precision "+
 "AND website_derived_intelligence.story_json <> excluded.story_json";
export const SINGLE_SQL=
 "INSERT INTO website_derived_intelligence "+
 "(id,category,published_at,date_precision,story_json,first_seen_at) "+
 "VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET story_json=excluded.story_json "+
 "WHERE website_derived_intelligence.category=excluded.category "+
 "AND website_derived_intelligence.published_at=excluded.published_at "+
 "AND website_derived_intelligence.date_precision=excluded.date_precision "+
 "AND website_derived_intelligence.story_json <> excluded.story_json";

export function providerUsage(result){
 const r=result?.result?.[0],m=r?.meta;
 if(result?.success!==true||!r||r.success===false||
    !Number.isSafeInteger(m?.rows_read)||m.rows_read<0||
    !Number.isSafeInteger(m?.rows_written)||m.rows_written<0)
  error("NATIVE_BILLABLE_META_MISSING");
 return {rows_read:m.rows_read,rows_written:m.rows_written,
  changes:Number.isSafeInteger(m.changes)?m.changes:null};
}
export function verifiedShadowConfig(env){
 if(env.GEOMACRO_D1_SHADOW_TARGET_APPROVED!=="YES"||
    !ACCOUNT.test(env.CLOUDFLARE_ACCOUNT_ID??"")||
    !UUID.test(env.GEOMACRO_D1_SHADOW_DATABASE_ID??"")||
    !UUID.test(env.D1_DATABASE_ID??"")||
    env.GEOMACRO_D1_SHADOW_DATABASE_ID.toLowerCase()===
      env.D1_DATABASE_ID.toLowerCase()||
    String(env.CLOUDFLARE_API_TOKEN??"").length<20)
  error("DEDICATED_SHADOW_CREDENTIAL_OR_APPROVAL_MISSING");
 return {account:env.CLOUDFLARE_ACCOUNT_ID,
  shadow:env.GEOMACRO_D1_SHADOW_DATABASE_ID,token:env.CLOUDFLARE_API_TOKEN};
}
const tableSchema=
 "CREATE TABLE IF NOT EXISTS website_derived_intelligence ("+
 "id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 14 AND 24),"+
 "category TEXT NOT NULL,published_at TEXT NOT NULL,date_precision TEXT NOT NULL,"+
 "story_json TEXT NOT NULL,first_seen_at TEXT NOT NULL)";
const metaSchema=
 "CREATE TABLE IF NOT EXISTS website_derived_materialized_meta_v1 ("+
 "id INTEGER PRIMARY KEY CHECK(id=1),data_revision INTEGER NOT NULL DEFAULT 0,"+
 "snapshot_revision INTEGER NOT NULL DEFAULT -1)";
const indexSQL=
 "CREATE INDEX IF NOT EXISTS idx_website_derived_hot_order_v2 "+
 "ON website_derived_intelligence(published_at DESC,id DESC,first_seen_at)";
const triggerSQL=
 "CREATE TRIGGER IF NOT EXISTS website_derived_materialized_insert_v1 "+
 "AFTER INSERT ON website_derived_intelligence BEGIN "+
 "UPDATE website_derived_materialized_meta_v1 "+
 "SET data_revision=data_revision+1 WHERE id=1; END";
const updateTriggerSQL=
 "CREATE TRIGGER IF NOT EXISTS website_derived_materialized_update_v1 "+
 "AFTER UPDATE OF story_json ON website_derived_intelligence BEGIN "+
 "UPDATE website_derived_materialized_meta_v1 "+
 "SET data_revision=data_revision+1 WHERE id=1; END";

export function syntheticPublisherRows(prefix,now=new Date()){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))error("CLOCK_INVALID");
 return Array.from({length:50},(_,i)=>{
  const id="macro-"+sha(prefix+":"+i).slice(0,8);
  const at=new Date(now.getTime()-3600_000).toISOString();
  const data={id,category:"macro",published_at:at,date_precision:"exact",
   title:"Geomacro finds synthetic shadow-only policy observation "+i,
   what_changed:"Synthetic test content, no real publisher event.",
   why_it_matters:"Synthetic shadow-only D1 billing probe, not intelligence.",
   status:"official_release_observed_unscored",
   same_event_corrob_verified:false,severity:null};
  return [id,"macro",at,"exact",JSON.stringify(data),now.toISOString()];
 });
}
export async function runShadowBillableProbe({env=process.env,
 fetchImpl=fetch,now=new Date(),salt=randomUUID()}={}){
 const cfg=verifiedShadowConfig(env);
 if(!/^[a-f0-9-]{10,70}$/iu.test(salt))error("RUN_SALT_INVALID");
 const base="https://api.cloudflare.com/client/v4/accounts/"+cfg.account+
  "/d1/database/"+cfg.shadow;
 const headers={Authorization:"Bearer "+cfg.token,"Content-Type":"application/json"};
 const about=await fetchImpl(base,{method:"GET",headers:{Authorization:headers.Authorization},
  redirect:"error",signal:AbortSignal.timeout(15000)});
 const info=await about.json();
 const db=info?.result;
 // Never trust the requested UUID alone: provider must prove an intentionally
 // named disposable DB that cannot be mistaken for canonical production.
 if(!about.ok||info?.success!==true||
    !/^geomacro-d1-publisher-shadow(?:-[a-z0-9-]+)?$/u.test(db?.name??"")||
    String(db?.uuid??"").toLowerCase()!==cfg.shadow.toLowerCase())
  error("PROVIDER_SHADOW_IDENTITY_UNVERIFIED");
 const usage=[];
 const query=async(label,sql,params=[])=>{
  const response=await fetchImpl(base+"/query",{method:"POST",headers,redirect:"error",
   body:JSON.stringify({sql,params:params.map(String)}),
   signal:AbortSignal.timeout(15000)});
  const json=await response.json();
  if(!response.ok)error("PROVIDER_QUERY_HTTP_"+response.status);
  const meta=providerUsage(json);
  usage.push({label,...meta});
  return {results:json.result[0]?.results??[],meta};
 };
 // Schema preparation is accounted separately from publisher data writes.
 await query("schema_table",tableSchema);
 await query("schema_meta",metaSchema);
 await query("schema_meta_seed",
  "INSERT OR IGNORE INTO website_derived_materialized_meta_v1 "+
  "(id,data_revision,snapshot_revision) VALUES(1,0,-1)");
 await query("schema_index",indexSQL);
 await query("schema_insert_trigger",triggerSQL);
 await query("schema_update_trigger",updateTriggerSQL);
 const first=syntheticPublisherRows("bulk:"+salt,now);
 const baseline=syntheticPublisherRows("single:"+salt,now);
 if(new Set([...first,...baseline].map(r=>r[0])).size!==100)
  error("SHADOW_ID_COLLISION");
 const firstWrite=await query("bulk_50_first",BULK_SQL,[JSON.stringify(first)]);
 const retry=await query("bulk_50_identical_retry",BULK_SQL,[JSON.stringify(first)]);
 let singlesRead=0,singlesWritten=0;
 for(let i=0;i<baseline.length;i++){
  const result=await query("single_item_"+i,SINGLE_SQL,baseline[i]);
  singlesRead+=result.meta.rows_read;
  singlesWritten+=result.meta.rows_written;
 }
 const modified=[...first.map(x=>[...x])];
 const updated=JSON.parse(modified[0][4]);
 updated.what_changed="Changed synthetic statement once; not a real news event.";
 modified[0][4]=JSON.stringify(updated);
 const oneChanged=await query("bulk_50_one_changed",BULK_SQL,[JSON.stringify(modified)]);
 const proof=await query("readback",
  "SELECT id,story_json FROM website_derived_intelligence "+
  "WHERE id IN (SELECT json_extract(value,'$[0]') FROM json_each(?))",
  [JSON.stringify(first)]);
 if(proof.results.length!==50||proof.results.some(x=>{
  const expected=modified.find(r=>r[0]===x.id);
  return !expected||expected[4]!==x.story_json;
 }))error("SHADOW_READBACK_INCOMPLETE");
 const metrics={
  first_50:firstWrite.meta,identical_retry_50:retry.meta,
  one_changed_50:oneChanged.meta,individual_50_total:{
   rows_read:singlesRead,rows_written:singlesWritten
  }
 };
 const verified=firstWrite.meta.rows_written>0&&
  retry.meta.rows_written===0&&oneChanged.meta.rows_written>0&&
  singlesWritten>0;
 const result={
  schema:"geomacro.cloudfare-native-d1-publisher-billable-shadow.v1",
  status:verified?"PASS_NATIVE_PROVIDER_ROWS":"HOLD_WRITES_NOT_PROVEN",
  measured_at:new Date().toISOString(),database_kind:"DEDICATED_NAMED_SHADOW_ONLY",
  shadow_uuid_sha256:sha(cfg.shadow),row_count:50,
  identical_retry_zero_billable_rows_written:retry.meta.rows_written===0,
  single_change_positive_billable_rows_written:oneChanged.meta.rows_written>0,
  metrics,
  setup_and_readback_rows:usage.filter(x=>![
   "bulk_50_first","bulk_50_identical_retry","bulk_50_one_changed"
  ].includes(x.label)&&!x.label.startsWith("single_item_"))
   .reduce((a,x)=>({rows_read:a.rows_read+x.rows_read,
     rows_written:a.rows_written+x.rows_written}),{rows_read:0,rows_written:0}),
  account_wide_utc_day_budget_verified:false,
  real_news_source_rows_written_to_production:false,
  paid_traffic_authorized:false
 };
 mkdirSync("artifacts/release",{recursive:true});
 writeFileSync(REPORT,JSON.stringify(result,null,2)+"\n",{mode:0o600});
 if(!verified)error("NOOP_BILLABLE_WRITES_NOT_PROVEN");
 return result;
}
const invoked=process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href;
if(invoked){
 const flags=process.argv.slice(2);
 if(flags.length===1&&flags[0]==="--dry-run"){
  console.log(JSON.stringify({status:"DRY_RUN_ONLY",provider_called:false,
   d1_billable_rows_measured:false,requires_separate_named_shadow:true,
   output:REPORT}));
 }else if(flags.length===1&&flags[0]==="--run-shadow"){
  runShadowBillableProbe().then(r=>console.log(JSON.stringify({
   status:r.status,metrics:r.metrics,report:REPORT
  }))).catch(e=>{console.error(JSON.stringify({status:"HOLD",
   code:/^D1_SHADOW_[A-Z0-9_]+$/u.test(e.message)?e.message:"D1_SHADOW_PROVIDER_UNVERIFIED"}));
   process.exitCode=2;});
 }else{console.error("Usage: --dry-run | --run-shadow");process.exitCode=2}
}
