#!/usr/bin/env bun
/**
 * #2046: manually gated B2/D1-native Risk Indices publisher.
 * Parent is a fresh, already verified direct-B2 Global Risk D1 hot snapshot.
 * This NEVER reads frozen Supabase or treats a private/offline GRI proof as public.
 * Publishing cannot repair a missing/stale parent. No payment paths.
 */
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { createB2Client } from "./b2-s3-client.mjs";
import { publishB2VerifiedHotSnapshot } from "./publish-b2-verified-hot-snapshot.mjs";
import { assertVerifiedCurrentGlobalRiskD1Parent } from "../lib/risk-indices-verified-d1-parent.mjs";
import { validateGlobalRiskContinuity } from "../../src/lib/global-risk-continuity.ts";
import { riskIndicesFromGlobalRisk } from "../../src/lib/risk-indices-from-global-risk.ts";
import { PUBLIC_RISK_INDICES_CONTRACT_VERSION } from "../../src/lib/risk-indices.types.ts";

const CONTROL = "https://geomacro-control-plane.daspallab202391.workers.dev";
const ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const BUCKET = "geomacro-private-archive";
const LIVE_KEY = "geomacro-evidence/v1/live/risk-indices-independent/latest.json.gz";
const PROOF_KEY = "geomacro-evidence/v1/live/risk-indices-independent/latest-proof.json";
const HISTORY_PREFIX = "geomacro-evidence/v1/history/risk-indices-d1-parent/gri-v1.2.0";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
function must(test,code){if(!test)throw Error("INDICES_D1_PUBLISH_"+code);}

async function fetchParent(){
  const response = await fetch(CONTROL+"/v1/public/hot-snapshot/global-risk",{
    headers:{"Accept":"application/json","Cache-Control":"no-cache"},
    signal:AbortSignal.timeout(12_000),
  });
  must(response.ok,"PARENT_UNAVAILABLE_"+response.status);
  const snapshot=await response.json();
  return assertVerifiedCurrentGlobalRiskD1Parent(snapshot);
}

function project(parent,now=Date.now()){
  const continuity=validateGlobalRiskContinuity(parent.risk,now);
  must(continuity.ok,"GRI_CONTINUITY_"+String(continuity.code??"INVALID"));
  const indices=riskIndicesFromGlobalRisk(parent.risk,now);
  must(indices.contractVersion===PUBLIC_RISK_INDICES_CONTRACT_VERSION &&
    indices.parentMethodologyVersion==="gri-v1.2.0" &&
    indices.verificationStatus==="verified" &&
    indices.snapshotAsOf===parent.sourceAsOf &&
    indices.proofHash===parent.risk.proofHash &&
    Array.isArray(indices.indices) && indices.indices.length===3,
    "INDICES_PROOF_BINDING_INVALID");
  const keys=new Set(["geopolitics","macro","critical_minerals"]);
  for(const item of indices.indices){
    must(keys.delete(item.key) && item.status==="available" &&
      item.readingStatus==="current" && Number.isFinite(item.score) &&
      item.series?.["7D"]?.buckets?.length>=2 &&
      item.series?.["30D"]?.buckets?.length>=2,
      "DOMAIN_NOT_CURRENT_"+String(item.key??"unknown"));
  }
  must(keys.size===0,"DOMAIN_MISSING");
  return indices;
}

async function main(){
  must(process.argv.length===3 && process.argv[2]==="--verified-d1-parent-only",
    "EXPLICIT_MODE_REQUIRED");
  must(!process.env.SUPABASE_DB_URL && !process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !process.env.APP_SUPABASE_URL && !process.env.APP_SUPABASE_SERVICE_ROLE_KEY &&
    process.env.B2_ACCOUNT_QUOTA_REQUIRED==="1" &&
    process.env.B2_ACCOUNT_QUOTA_WORKFLOW_ID==="risk_indices_d1_parent" &&
    process.env.B2_REQUEST_BUDGET==="12" &&
    process.env.B2_S3_ENDPOINT===ENDPOINT &&
    Boolean(process.env.B2_KEY_ID) && Boolean(process.env.B2_APPLICATION_KEY) &&
    Boolean(process.env.D1_DATABASE_ID) && Boolean(process.env.CLOUDFLARE_API_TOKEN) &&
    Boolean(process.env.CLOUDFLARE_ACCOUNT_ID) &&
    /^\d{1,20}$/.test(String(process.env.GITHUB_RUN_ID??"")) &&
    String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").length>=32,
    "GOVERNED_QUOTA_AND_RUNTIME_REQUIRED");
  // Authenticate source freshness and hashes before allocating a B2 client.
  const parent=await fetchParent();
  const immutable=project(parent,Date.parse(parent.sourceAsOf));
  const current=project(parent);
  const history={
    schema:"geomacro.risk-indices-verified-d1-parent-history.v1",
    source_project:"ldpwajisioljyjtojvfx",
    source_as_of:parent.sourceAsOf,
    parent_global_risk_b2_sha256:parent.parentB2Sha256,
    parent_global_risk_payload_sha256:parent.parentPayloadSha256,
    parent_global_risk_generated_at:parent.parentGeneratedAt,
    data:immutable,
  };
  const historyBytes=Buffer.from(JSON.stringify(history),"utf8");
  const historyPacked=gzipSync(historyBytes,{level:9});
  const historyDigest=sha(historyPacked);
  const historyKey=HISTORY_PREFIX+"/"+historyDigest+".json.gz";
  const b2=createB2Client({
    endpointUrl:ENDPOINT,bucket:BUCKET,
    accessKey:process.env.B2_KEY_ID,
    secretKey:process.env.B2_APPLICATION_KEY,
  });
  const existing=await b2.getOptional(historyKey);
  if(existing){
    must(sha(existing)===historyDigest &&
      gunzipSync(existing).equals(historyBytes),"IMMUTABLE_HISTORY_MISMATCH");
  }else{
    await b2.put(historyKey,historyPacked);
    const back=await b2.get(historyKey);
    must(sha(back)===historyDigest &&
      gunzipSync(back).equals(historyBytes),"HISTORY_B2_READBACK_FAILED");
  }
  // Recheck after any B2 wait; a stale parent cannot be made current by PUT.
  assertVerifiedCurrentGlobalRiskD1Parent(parent.originalSnapshot);
  // Parent state may have been superseded while B2 work ran. Refuse to write
  // a latest pointer sourced from a different D1 authoritative parent.
  const latestParent=await fetchParent();
  must(latestParent.parentPayloadSha256===parent.parentPayloadSha256 &&
    latestParent.parentB2Sha256===parent.parentB2Sha256 &&
    latestParent.sourceAsOf===parent.sourceAsOf,"PARENT_CHANGED");
  project(latestParent);
  const generatedAt=new Date().toISOString();
  const value={
    schema:"geomacro.public-risk-indices-live.v1",
    generated_at:generatedAt,source_project:"ldpwajisioljyjtojvfx",
    history_key:historyKey,
    parent_global_risk_payload_sha256:parent.parentPayloadSha256,
    parent_global_risk_b2_sha256:parent.parentB2Sha256,
    data:current,
  };
  const raw=Buffer.from(JSON.stringify(value),"utf8");
  const packed=gzipSync(raw,{level:9});
  const digest=sha(packed);
  await b2.put(LIVE_KEY,packed);
  const liveBack=await b2.get(LIVE_KEY);
  must(sha(liveBack)===digest &&
    gunzipSync(liveBack).equals(raw),"CURRENT_B2_READBACK_FAILED");
  const proof={
    schema:"geomacro.public-risk-indices-live-proof.v1",
    generated_at:generatedAt,source_project:value.source_project,
    live_key:LIVE_KEY,history_key:historyKey,
    snapshot_id:current.snapshotId,snapshot_as_of:parent.sourceAsOf,
    contract_version:current.contractVersion,
    parent_methodology_version:current.parentMethodologyVersion,
    parent_global_risk_payload_sha256:parent.parentPayloadSha256,
    parent_global_risk_b2_sha256:parent.parentB2Sha256,
    compressed_sha256:digest,compressed_bytes:packed.length,
    full_b2_readback_verified:true,exact_gzip_restore_verified:true,
  };
  const proofRaw=Buffer.from(JSON.stringify(proof),"utf8");
  await b2.put(PROOF_KEY,proofRaw);
  must((await b2.get(PROOF_KEY)).equals(proofRaw),"PROOF_B2_READBACK_FAILED");
  // The D1 worker independently applies its 90-minute source-time TTL.
  const hot=await publishB2VerifiedHotSnapshot({
    product:"risk-indices",value,proof,
  });
  must(hot?.full_b2_readback_verified===true &&
    hot?.exact_gzip_restore_verified===true &&
    hot?.payload_sha256===sha(raw),"D1_HOT_READBACK_UNVERIFIED");
  console.log(JSON.stringify({
    ok:true,schema:"geomacro.risk-indices-d1-parent-publication.v1",
    authority_read:"verified-current-global-risk-d1",
    source_as_of:parent.sourceAsOf,
    parent_payload_sha256:parent.parentPayloadSha256,
    published_payload_sha256:sha(raw),
    b2_full_readback_verified:true,
    d1_hot_snapshot_published:true,
    supabase_reads:0,supabase_writes:0,real_funds_touched:false,
  }));
}
try{await main();}catch(error){
  const message=String(error?.message??"");
  const code=/^INDICES_(?:D1_PARENT|D1_PUBLISH)_[A-Z0-9_]+$/.test(message)
    ? message:"INDICES_D1_PUBLISH_FAILED_CLOSED";
  console.error(JSON.stringify({ok:false,error:code,
    supabase_reads:0,supabase_writes:0,real_funds_touched:false}));
  process.exitCode=1;
}
