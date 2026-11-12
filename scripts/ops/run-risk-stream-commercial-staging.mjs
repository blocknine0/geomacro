#!/usr/bin/env node
/**
 * Protected exact-main Cloudflare shadow commercial staging.
 * Never accesses production D1 and never sends a real customer webhook.
 * Uses only mock ACK Worker + existing isolated shadow D1.
 */
import {spawnSync} from "node:child_process";
import {createHmac} from "node:crypto";
import {existsSync,readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {assertOfficialMain,signedReport} from "../release-common.ts";

const SHA=assertOfficialMain();
const root=process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"";
const token=process.env.CLOUDFLARE_API_TOKEN??"";
const account=process.env.CLOUDFLARE_ACCOUNT_ID??"";
const adminCfg="workers/risk-stream-shadow/wrangler.shadow.runtime.jsonc";
const ackCfg="workers/risk-stream-shadow-ack/wrangler.jsonc";
const deny=x=>{throw Error("COMMERCIAL_SHADOW_STAGING_"+x)};
if(process.env.COMMERCIAL_STAGING_APPROVAL!=="RUN_SHADOW_COMMERCIAL_E2E_NO_FUNDS"||
   root.length<32||token.length<20||!/^[0-9a-f]{32}$/u.test(account)||
   !existsSync(adminCfg)||!existsSync(ackCfg))
 deny("PROTECTED_APPROVAL_OR_CONFIG_MISSING");
const derive=scope=>createHmac("sha256",root).update(scope).digest("hex");
const ackToken=derive("geomacro-shadow-commercial-ack-v1");
const admin=derive("geomacro-shadow-risk-stream-20261111/admin-bearer");
const wrangler=(args,input)=>{
 const r=spawnSync("npx",["-y","wrangler@4.136.3",...args],{
  input,encoding:"utf8",env:process.env,timeout:120000,maxBuffer:1000000});
 if(r.status!==0)deny("WRANGLER_"+args.slice(0,2).join("_").replace(/[^A-Z0-9_]/giu,"_")+"_FAILED");
 return r.stdout;
};
// The already protected issuer is disabled in shadow; only this test-specific
// ACK token is shared with the mock Worker, never with a customer.
// Isolated ACK service must exist before the caller's Service Binding.
wrangler(["deploy","--config",ackCfg]);
wrangler(["secret","put","STREAM_SHADOW_ACK_TOKEN","--config",ackCfg],ackToken+"\n");
const cfg=JSON.parse(readFileSync(adminCfg,"utf8"));
if(cfg.name!=="geomacro-risk-stream-shadow"||
 !Array.isArray(cfg.d1_databases)||cfg.d1_databases.length!==1||
 cfg.d1_databases[0].database_name!=="geomacro-risk-stream-shadow"||
 cfg.vars?.STREAM_MODE!=="SHADOW_AUDIT"||
 cfg.vars?.RISK_STREAM_ACTIVE!=="0"||
 cfg.vars?.STREAM_INGESTION_ENABLED!=="false")deny("SHADOW_CONFIG_NOT_ISOLATED");
cfg.services=[{binding:"SHADOW_COMMERCIAL_ACK",service:"geomacro-risk-stream-shadow-ack"}];
writeFileSync(adminCfg,JSON.stringify(cfg,null,2),{mode:0o600});
wrangler(["deploy","--config",adminCfg]);
wrangler(["secret","put","STREAM_SHADOW_ACK_TOKEN","--config",adminCfg],ackToken+"\n");
const subRes=await fetch("https://api.cloudflare.com/client/v4/accounts/"+
  account+"/workers/subdomain",{
 headers:{Authorization:"Bearer "+token},redirect:"error",
 signal:AbortSignal.timeout(15000)});
const sub=await subRes.json().catch(()=>null);
if(subRes.status!==200||sub?.success!==true||
   !/^[a-z0-9-]{3,63}$/u.test(sub.result?.subdomain??""))
 deny("WORKERS_SUBDOMAIN_PROVIDER_UNVERIFIED");
const host=sub.result.subdomain;
const ackUrl="https://geomacro-risk-stream-shadow-ack."+host+
 ".workers.dev/v1/internal/mock-commercial-ack";
const shadowUrl="https://geomacro-risk-stream-shadow."+host+
 ".workers.dev/v1/internal/shadow/commercial-e2e";
const health=await fetch("https://geomacro-risk-stream-shadow-ack."+
 host+".workers.dev/healthz",{redirect:"error",signal:AbortSignal.timeout(15000)});
const healthBody=await health.json().catch(()=>null);
if(health.status!==200||healthBody?.service!=="SHADOW_COMMERCIAL_ACK_ONLY")
 deny("ACK_MOCK_HTTPS_NOT_LIVE");
// This synthetic transport probe exercises the real receiver's POST contract:
// authentication, identity headers and the no-funds payload structure.
const probeId=createHmac("sha256",ackToken).update("shadow-ack-probe-"+SHA).digest("hex");
const probeHash=createHmac("sha256",ackToken).update("shadow-ack-payload-"+SHA).digest("hex");
const probe=await fetch(ackUrl,{
 method:"POST",redirect:"manual",signal:AbortSignal.timeout(15000),
 headers:{"Content-Type":"application/json",
  "X-GeoMacro-Shadow-ACK":ackToken,
  "X-GeoMacro-Delivery-ID":probeId,
  "Idempotency-Key":probeId,
  "X-GeoMacro-License-ID":"GEOMACRO_COMMERCIAL_REDISTRIBUTION_v1"},
 body:JSON.stringify({
  payload:{license_id:"GEOMACRO_COMMERCIAL_REDISTRIBUTION_v1",
   charged:false,execution_authorized:false},
  license_proof:{payload_sha256:probeHash}
 })
});
const probeAck=probe.status===200&&!probe.redirected?
 await probe.json().catch(()=>null):null;
if(probe.status!==200||probe.redirected||
   probeAck?.schema!=="geomacro.commercial-webhook-ack.v1"||
   probeAck.job_id!==probeId||probeAck.payload_sha256!==probeHash||
   probeAck.status!=="ACCEPTED")
 deny("ACK_PROTECTED_POST_PREFLIGHT_HTTP_"+
  (Number.isInteger(probe.status)&&probe.status>=100&&probe.status<=599
   ?probe.status:"UNKNOWN")+(probe.redirected?"_REDIRECT":""));
const raw=wrangler(["d1","execute","geomacro-risk-stream-shadow",
 "--remote","--json","--config",adminCfg,"--command",
 "SELECT type,name FROM sqlite_schema WHERE name IN ("+
 "'risk_stream_commercial_subscriptions','risk_stream_commercial_outbox',"+
 "'risk_stream_commercial_delivery_receipts','risk_stream_commercial_risk_chain',"+
 "'idx_risk_stream_commercial_due','idx_risk_stream_commercial_history_7d')"]);
const doc=JSON.parse(raw);
const rows=doc.flatMap(x=>x.results??[]);
if(rows.length!==6)deny("0216_SHADOW_SCHEMA_READBACK_NOT_6_OF_6");
const runId="shadow-"+process.env.GITHUB_RUN_ID+"-"+process.env.GITHUB_RUN_ATTEMPT;
const response=await fetch(shadowUrl,{
 method:"POST",redirect:"error",signal:AbortSignal.timeout(25000),
 headers:{"Content-Type":"application/json","Authorization":"Bearer "+admin},
 body:JSON.stringify({schema:"geomacro.shadow-commercial-staging-request.v1",
  ack_url:ackUrl,run_id:runId})
});
const receipt=await response.json().catch(()=>null);
if(response.status!==200||receipt?.status!=="PASS"||
  receipt.source_sha!==SHA||receipt.synthetic_fixtures_only!==true||
  receipt.customer_traffic_sent!==false||
  receipt.delivery_receipt_readback!==true)
 deny("SHADOW_E2E_PROVIDER_RECEIPT_UNVERIFIED_"+String(receipt?.error??response.status).slice(0,80));
mkdirSync("artifacts/release",{recursive:true});
signedReport("artifacts/release/shadow-commercial-e2e.json",{
 ...receipt,status:"PASS",executing_main_sha:SHA,
 approved_mode:"SHADOW_ONLY_NO_FUNDS",
 verified_at:new Date().toISOString()
});
console.log(JSON.stringify({status:"PASS_PROVIDER_SHADOW_COMMERCIAL_E2E",
 source_sha:SHA,run_id:runId,
 remote_d1_schema_objects:6,https_mock_ack:true,
 license_id:receipt.license_id,
 commercial_outbox_readback:true,receipt_readback:true,
 customer_delivery:false,no_funds:true}));
