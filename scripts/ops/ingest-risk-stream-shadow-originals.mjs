#!/usr/bin/env node
/**
 * Protected optional 20-original shadow feeder. All 20 attestations and
 * actual PRODUCTION source registry authorizations must pass before a
 * SINGLE source is promoted in ISOLATED SHADOW D1. No production D1 writes.
 * Genuine source text never appears in logs or PR artifacts.
 */
import {readFileSync,writeFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {spawnSync} from "node:child_process";
import {createHmac,createHash,createPublicKey,verify as verifyEd}
 from "node:crypto";
import {validateRealOriginalManifest} from "../lib/risk-stream-original-manifest.mjs";
const ENV=process.env,ROOT=ENV.GEOMACRO_COMMERCE_LEDGER_TOKEN||"";
const SHADOW="geomacro-risk-stream-shadow",PROD="geomacro-control-plane";
const CONFIG=".shadow-audit/production-registry-readonly.jsonc";
function need(v,e){if(!v)throw Error("REAL_ORIGINALS_SHADOW_HOLD_"+e)}
function wrangler(args){
 const r=spawnSync("npx",["-y","wrangler@4.136.3",...args],{
  encoding:"utf8",timeout:100000,env:ENV,maxBuffer:2000000});
 if(r.status!==0||r.error)
  throw Error("REAL_ORIGINALS_PROTECTED_D1_READ_OR_WRITE_FAILED_"+args.slice(0,3).join("_"));
 return r.stdout;
}
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
function rowsFrom(json){
 const parsed=JSON.parse(json);
 need(Array.isArray(parsed),"D1_QUERY_SHAPE_INVALID");
 return parsed.flatMap(x=>x.results||x?.result?.results||[]);
}
function readOnlyProductionRegistry(ids){
 const dbs=JSON.parse(wrangler(["d1","list","--json"]));
 const row=dbs.find(x=>x.name===PROD),id=row?.uuid||row?.id;
 need(/^[a-f0-9-]{36}$/i.test(id??""),"PRODUCTION_REGISTRY_DB_NOT_PRESENT");
 const cfg={name:"geomacro-stream-shadow-registry-observer",main:"unused.mjs",
  compatibility_date:"2026-10-03",d1_databases:[{binding:"DB",
   database_name:PROD,database_id:id}]};
 writeFileSync(CONFIG,JSON.stringify(cfg,null,2),{mode:0o600});
 const sql="SELECT source_id,publisher_root_domain,parent_media_entity,source_role,"+
  "commercial_rights_approved,enabled,reviewed_at,rights_expire_at "+
  "FROM risk_stream_sources WHERE source_id IN "+
  "(SELECT value FROM json_each("+quote(JSON.stringify(ids))+")) ORDER BY source_id";
 return rowsFrom(wrangler(["d1","execute","DB","--remote","--json",
  "--config",CONFIG,"--command",sql]));
}
function stageShadowApprovedRows(approved,meta){
 const list=approved.map(x=>"("+[
  x.source_id,x.publisher_root_domain,x.parent_media_entity,x.source_role,
  1,1,x.reviewed_at,x.rights_expire_at
 ].map((v,i)=>(i===4||i===5)?String(v):v===null?"NULL":quote(v)).join(",")+")").join(",");
 const sql="INSERT OR IGNORE INTO risk_stream_sources "+
  "(source_id,publisher_root_domain,parent_media_entity,source_role,"+
  "commercial_rights_approved,enabled,reviewed_at,rights_expire_at) VALUES "+
  list+";";
 wrangler(["d1","execute",SHADOW,"--remote","--config",
  "workers/risk-stream-shadow/wrangler.shadow.runtime.jsonc","--command",sql]);
 const ids=approved.map(x=>x.source_id);
 const rows=rowsFrom(wrangler(["d1","execute",SHADOW,"--remote","--json","--config",
  "workers/risk-stream-shadow/wrangler.shadow.runtime.jsonc","--command",
  "SELECT source_id,publisher_root_domain,parent_media_entity,source_role,"+
  "commercial_rights_approved,enabled,rights_expire_at FROM risk_stream_sources WHERE source_id IN "+
  "(SELECT value FROM json_each("+quote(JSON.stringify(ids))+"))"]));
 need(rows.length===approved.length,"SHADOW_REGISTRY_READBACK_COUNT_DIVERGED");
 const prod=new Map(approved.map(x=>[x.source_id,x]));
 for(const row of rows){
  const expected=prod.get(row.source_id);
  need(expected&&row.publisher_root_domain===expected.publisher_root_domain&&
   row.parent_media_entity===expected.parent_media_entity&&
   row.source_role===expected.source_role&&row.commercial_rights_approved===1&&
   row.enabled===1&&row.rights_expire_at===expected.rights_expire_at,
   "SHADOW_REGISTRY_PRODUCTION_AUTHORITY_MISMATCH");
 }
}
async function main(){
 need(ENV.GITHUB_REPOSITORY==="blocknine0/geomacro"&&
  ENV.GITHUB_REF==="refs/heads/main"&&ROOT.length>=32,
  "PROTECTED_MAIN_AND_LEDGER_REQUIRED");
 const packed=ENV.RISK_STREAM_SHADOW_ORIGINALS_GZIP_B64||"";
 need(packed.length>0&&packed.length<=44000&&/^[A-Za-z0-9+/]+={0,2}$/.test(packed),
  "PROTECTED_ORIGINALS_COMPRESSED_SECRET_UNAVAILABLE");
 const raw=gunzipSync(Buffer.from(packed,"base64"),{
  maxOutputLength:250000}).toString("utf8");
 const events=raw.trim().split(/\r?\n/u).map(JSON.parse);
 const checked=validateRealOriginalManifest(events,{
  factsPublicB64:ENV.RISK_STREAM_MACHINE_FACTS_SPKI_B64,
  rightsPublicB64:ENV.RISK_STREAM_MACHINE_RIGHTS_SPKI_B64});
 need(checked.independent_pairs===10&&checked.originals===20,
  "SIGNED_MANIFEST_10_PAIRS_REQUIRED");
 const meta=JSON.parse(readFileSync(".shadow-audit/metadata.json","utf8"));
 need(meta.independent_attester_keys===true&&
  meta.commercial_delivery===false&&meta.risk_stream_active===false,
  "PROTECTED_SHADOW_KEYS_NOT_PROVISIONED");
 const ids=[...new Set(events.map(x=>x.source_id))].sort();
 const registry=readOnlyProductionRegistry(ids);
 need(registry.length===ids.length,"PRODUCTION_APPROVED_SOURCE_IDS_MISSING");
 const now=Date.now(),byId=new Map(registry.map(x=>[x.source_id,x]));
 for(const event of events){
  const row=byId.get(event.source_id);
  need(row&&row.enabled===1&&row.commercial_rights_approved===1&&
   row.publisher_root_domain===event.publisher_root_domain&&
   row.parent_media_entity===event.parent_media_entity&&
   row.source_role===event.source_role&&
   (row.rights_expire_at===null||
    Date.parse(row.rights_expire_at)>now)&&
   Number.isFinite(Date.parse(row.reviewed_at)),
   "PRODUCTION_RIGHTS_REGISTRY_IDENTITY_OR_EXPIRY_HOLD");
 }
 stageShadowApprovedRows(registry,meta);
 const base=readFileSync(".shadow-audit/worker-url.txt","utf8").trim();
 need(/^https:\/\/geomacro-risk-stream-shadow\.[a-z0-9-]+\.workers\.dev$/.test(base),
  "SHADOW_WORKER_ORIGIN_UNTRUSTED");
 const bearer=createHmac("sha256",ROOT).update(
  "geomacro-shadow-risk-stream-20261111/admin-bearer").digest("hex");
 const h={Authorization:"Bearer "+bearer,"Content-Type":"application/json"};
 const t0=Date.now();
 const q=await fetch(base+"/v1/internal/shadow/events",{
  method:"POST",headers:h,redirect:"error",signal:AbortSignal.timeout(30000),
  body:JSON.stringify({schema:"geomacro.risk-stream-ingest-batch.v1",items:events})});
 const queued=await q.json().catch(()=>null);
 need(q.status===202&&queued?.accepted===20&&queued?.commercial_delivery===false,
  "SHADOW_SIGNED_ORIGINAL_QUEUE_ACK_UNAVAILABLE");
 let receipts=[],done=false;
 for(let i=0;i<36;i++){
  await new Promise(resolve=>setTimeout(resolve,5000));
  const response=await fetch(base+"/v1/internal/shadow/receipts",{
   headers:h,redirect:"error",signal:AbortSignal.timeout(15000)});
  if(!response.ok)continue;
  const v=await response.json().catch(()=>null);
  receipts=(v?.rows||[]).filter(x=>Date.parse(x.started_at)>=t0-1000);
  if(receipts.reduce((x,y)=>x+y.event_count,0)>=20){done=true;break}
 }
 need(done&&receipts.every(x=>x.d1_503_observed===0),
  "SHADOW_ORIGINAL_QUEUE_RECEIPT_HOLD");
 const fprints=[...new Set(events.map(x=>x.event_fingerprint))];
 const config="workers/risk-stream-shadow/wrangler.shadow.runtime.jsonc";
 const sql="SELECT gro_id,event_fingerprint,payload_json,payload_sha256,signature_b64 "+
  "FROM risk_stream_signed_gro WHERE event_fingerprint IN "+
  "(SELECT value FROM json_each("+quote(JSON.stringify(fprints))+"))";
 const groRows=rowsFrom(wrangler(["d1","execute",SHADOW,"--remote","--json",
  "--config",config,"--command",sql]));
 const verifier=createPublicKey({key:Buffer.from(meta.gro_public_spki_b64,"base64"),
  format:"der",type:"spki"});
 need(verifier.asymmetricKeyType==="ed25519"&&groRows.length>=10,
  "TEN_SIGNED_GRO_D1_READBACK_MISSING");
 let valid=0;
 for(const row of groRows){
  const payload=JSON.parse(row.payload_json);
  need(createHash("sha256").update(row.payload_json).digest("hex")===
    row.payload_sha256&&
   payload.customer_delivery_authorized===false&&
   payload.charged===false&&payload.certified_risk_index===false&&
   payload.execution_authorized===false&&
   verifyEd(null,Buffer.from(row.payload_json),verifier,
    Buffer.from(row.signature_b64,"base64")),
   "D1_SIGNED_GRO_CRYPTO_OR_NO_FUNDS_MISMATCH");
  valid++;
 }
 const originalSql="SELECT COUNT(*) AS n FROM risk_stream_evidence WHERE original_verified=1 "+
  "AND event_fingerprint IN (SELECT value FROM json_each("+
   quote(JSON.stringify(fprints))+")) AND private_r2_object_key IS NOT NULL";
 const originals=rowsFrom(wrangler(["d1","execute",SHADOW,"--remote","--json",
  "--config",config,"--command",originalSql]));
 need(Number(originals?.[0]?.n)===20,"TWENTY_ORIGINAL_ARCHIVE_POINTERS_MISSING");
 const dispatched=rowsFrom(wrangler(["d1","execute",SHADOW,"--remote","--json",
  "--config",config,"--command",
  "SELECT COUNT(*) AS n FROM risk_stream_delivery_outbox WHERE state='DISPATCHED'"]));
 need(Number(dispatched?.[0]?.n)===0,"CUSTOMER_DELIVERY_OUTBOX_NOT_HELD");
 const prior=JSON.parse(readFileSync(".shadow-audit/live-telemetry.json","utf8"));
 need(prior.event_source==="REAL_GDELT_OR_RSS_INDEX_ONLY"&&
  prior.acknowledged_events===prior.submitted_events&&
  prior.submitted_events>=20&&prior.submitted_events<=30,
  "INDEX_ONLY_SHADOW_RECEIPT_MISSING");
 const d1_503=receipts.reduce((n,x)=>n+x.d1_503_observed,0);
 const signed=receipts.reduce((n,x)=>n+x.corroborated_and_signed,0);
 const receiptsRead=receipts.reduce((n,x)=>n+x.verified_signature_readbacks,0);
 need(signed>=10&&receiptsRead>=10&&valid>=10&&d1_503===0,
  "TEN_NEW_SIGNED_AND_INDEPENDENT_READBACK_RECEIPTS_MISSING");
 const next={...prior,signed_gro_count:signed,
  verified_signature_readback_count:Math.min(receiptsRead,valid),
  original_events_submitted:20,original_events_registry_approved:20,
  external_production_registry_readonly_proven:true,
  original_private_r2_pointer_count:Number(originals[0].n),
  original_d1_503_observed:0,independent_signed_gro_acceptance:true,
  private_original_r2_readback:true,commercial_canary_cleared:false,
  status:"INDEX_AND_GENUINE_DUAL_ATTESTED_GRO_SHADOW_PASS"};
 writeFileSync(".shadow-audit/live-telemetry.json",JSON.stringify(next,null,2));
 console.log("TEN_GENUINE_DUAL_ATTESTED_SHADOW_GROS_VERIFIED "+
  JSON.stringify({new_signed:signed,ed25519_readbacks:valid,
   original_records:20,independent_pairs:10,
   producer_registry_readback:true,observed_d1_503:0,
   customer_delivery:false,release_hold_retained:true}));
}
main().catch(e=>{console.error(String(e?.message||e).slice(0,240));process.exitCode=1});
