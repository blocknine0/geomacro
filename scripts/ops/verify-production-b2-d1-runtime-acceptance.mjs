#!/usr/bin/env bun
import {createHash,createHmac,randomUUID} from "node:crypto";
import {createB2Client} from "./b2-s3-client.mjs";
import {createB2D1AccountGovernor} from "./b2-d1-account-governor.mjs";

const B2_ENDPOINT="https://s3.us-east-005.backblazeb2.com";
const CONTROL_PLANE_URL="https://geomacro-control-plane.daspallab202391.workers.dev";
const BUCKET="geomacro-private-archive";
const PREFIX="geomacro-evidence/v1/private/runtime-config-acceptance/";
const REQUIRED=[
  "B2_KEY_ID","B2_APPLICATION_KEY","CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN","D1_DATABASE_ID","GEOMACRO_COMMERCE_LEDGER_TOKEN",
];
const FORBIDDEN=[
  "SUPABASE_DB_URL","SUPABASE_URL","APP_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY","APP_SUPABASE_SERVICE_ROLE_KEY",
  "COINBASE_API_KEY","COINBASE_COMMERCE_API_KEY",
  "COINBASE_X402_MAINNET_ACK","GEOMACRO_COMMERCIAL_LAUNCH_ACK",
];
const KINDS=["GET","PUT","HEAD","NATIVE_AUTH"];
const sha256=(bytes)=>createHash("sha256").update(bytes).digest("hex");
const present=(value)=>typeof value==="string"&&value.trim().length>0;
const integer=(value)=>Number.isSafeInteger(Number(value))&&Number(value)>=0;

function fail(code){throw new Error(code);}
export function classifyB2ProbeProviderFailure(error){
  // B2 client emits fixed status/error codes. Never expose upstream XML,
  // signed URLs, exception messages, credentials or arbitrary response bodies.
  const code=error instanceof Error ? error.message : "";
  if(/(?:transaction_cap_exceeded|download_cap_exceeded)/i.test(code))
    return "B2_PROVIDER_CAP_EXCEEDED";
  if(code==="B2_PROVIDER_THROTTLED" || /^B2_(?:PUT|GET)_FAILED_429_/.test(code))
    return "B2_PROVIDER_RATE_LIMIT";
  if(code==="B2_REQUEST_BUDGET_EXHAUSTED" || code.startsWith("B2_ACCOUNT_GLOBAL_QUOTA_"))
    return "B2_D1_QUOTA_DENIED";
  if(code==="B2_ARCHIVE_CONFIG_INVALID" || code==="B2_ARCHIVE_READ_CREDENTIAL_PAIR_INCOMPLETE")
    return "B2_CREDENTIAL_CONFIGURATION_INVALID";
  if(/^B2_NATIVE_AUTHORIZE_FAILED_(?:401|403)_/.test(code))
    return "B2_CREDENTIALS_REJECTED";
  if(/^B2_(?:PUT|GET)_FAILED_403_/.test(code) ||
     ["B2_NATIVE_READ_CAPABILITY_MISSING","B2_NATIVE_READ_BUCKET_NOT_ALLOWED",
       "B2_NATIVE_READ_PREFIX_NOT_ALLOWED"].includes(code))
    return "B2_CREDENTIAL_OR_BUCKET_SCOPE_DENIED";
  if(/^B2_(?:PUT|GET)_FAILED_404_/.test(code))
    return "B2_OBJECT_NOT_FOUND";
  if(/^B2_(?:PUT|GET)_FAILED_(?:408|500|502|503|504)_/.test(code) ||
     /^B2_(?:PUT|GET)_RETRY_EXHAUSTED$/.test(code))
    return "B2_PROVIDER_TRANSIENT_EXHAUSTED";
  if(["B2_NATIVE_AUTHORIZE_NETWORK_FAILED","B2_NATIVE_GET_NETWORK_FAILED"].includes(code))
    return "B2_NETWORK_UNAVAILABLE";
  if(["B2_READBACK_SHA256_MISMATCH","B2_READBACK_CONTENT_LENGTH_MISMATCH"].includes(code))
    return "B2_BYTE_INTEGRITY_MISMATCH";
  return "B2_FAILURE_NOT_YET_CLASSIFIED";
}

function safeStatus(receipt,expectedDay){
  if(receipt?.ok!==true||
    receipt.schema!=="geomacro.b2-account-quota-status.v1"||
    receipt.day_utc!==expectedDay||
    receipt.account_wide_reporting_requires_all_clients_governed!==true||
    !receipt.used||!receipt.limits||
    !integer(receipt.used.total)||!integer(receipt.limits.total)||
    KINDS.some(k=>!integer(receipt.used[k])||!integer(receipt.limits[k])||
      receipt.used[k]>receipt.limits[k])||
    receipt.used.total>receipt.limits.total||
    KINDS.reduce((sum,k)=>sum+Number(receipt.used[k]),0)!==Number(receipt.used.total)){
    fail("D1_QUOTA_STATUS_READBACK_INVALID");
  }
  return receipt;
}
function requiredConfig(env){
  const missing=REQUIRED.filter((key)=>!present(env[key]));
  const runId=String(env.GITHUB_RUN_ID??"");
  const attempt=String(env.GITHUB_RUN_ATTEMPT??"");
  if(!/^\d{1,20}$/.test(runId))missing.push("GITHUB_RUN_ID");
  if(!/^\d{1,4}$/.test(attempt))missing.push("GITHUB_RUN_ATTEMPT");
  if(env.GITHUB_ACTIONS!=="true")fail("PRODUCTION_GITHUB_ACTIONS_CONTEXT_REQUIRED");
  if(env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
     env.GITHUB_REF!=="refs/heads/main")fail("CANONICAL_MAIN_ONLY");
  if(String(env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").trim().length<32 &&
     !missing.includes("GEOMACRO_COMMERCE_LEDGER_TOKEN"))
    missing.push("GEOMACRO_COMMERCE_LEDGER_TOKEN");
  if(env.B2_ACCOUNT_QUOTA_REQUIRED!=="1")missing.push("B2_ACCOUNT_QUOTA_REQUIRED");
  if(env.B2_REQUEST_BUDGET!=="8")missing.push("B2_REQUEST_BUDGET");
  const expectedWorkflow=`runtime_probe_${runId}_${attempt}`;
  if(env.B2_ACCOUNT_QUOTA_WORKFLOW_ID!==expectedWorkflow)
    missing.push("B2_ACCOUNT_QUOTA_WORKFLOW_ID");
  const forbidden=FORBIDDEN.filter((key)=>present(env[key]));
  if(forbidden.length)fail("SUPABASE_OR_PAYMENT_BOUNDARY_VIOLATED");
  if(missing.length)fail("PRODUCTION_B2_D1_CONFIGURATION_MISSING:"+missing.join(","));
  return {runId,attempt,workflowId:expectedWorkflow};
}

async function d1Query({env,fetchImpl,sql,params}){
  const endpoint=`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}/d1/database/${encodeURIComponent(env.D1_DATABASE_ID)}/query`;
  let response,payload;
  try{
    response=await fetchImpl(endpoint,{
      method:"POST",
      headers:{
        authorization:`Bearer ${env.CLOUDFLARE_API_TOKEN}`,
        "content-type":"application/json",
      },
      body:JSON.stringify({sql,params}),
      signal:AbortSignal.timeout(15000),
    });
    payload=await response.json();
  }catch{
    fail("D1_RUNTIME_QUERY_FAILED");
  }
  if(!response?.ok||payload?.success!==true||
     !Array.isArray(payload?.result)||payload.result.length!==1||
     payload.result[0]?.success===false||
     !Array.isArray(payload.result[0]?.results)){
    fail("D1_RUNTIME_QUERY_REJECTED");
  }
  return payload.result[0].results;
}

async function readControlPlaneQuotaStatus({env,fetchImpl,expectedDay}){
  const root=String(env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").trim();
  const token=createHmac("sha256",root).update("geomacro-control-plane-v1").digest("hex");
  let response,payload;
  try{
    response=await fetchImpl(`${CONTROL_PLANE_URL}/v1/b2-quota/status`,{
      method:"GET",
      headers:{authorization:`Bearer ${token}`,accept:"application/json",
        "cache-control":"no-cache"},
      signal:AbortSignal.timeout(15000),
    });
    payload=await response.json();
  }catch{
    fail("CONTROL_PLANE_D1_STATUS_READ_FAILED");
  }
  if(!response?.ok||payload?.ok!==true){
    if(response?.status===401)fail("CONTROL_PLANE_TOKEN_MISMATCH");
    if(payload?.error==="CONTROL_PLANE_AUTH_UNCONFIGURED")
      fail("CONTROL_PLANE_AUTH_UNCONFIGURED");
    if(payload?.error==="D1_BINDING_MISSING")fail("CONTROL_PLANE_D1_BINDING_MISSING");
    fail("CONTROL_PLANE_D1_STATUS_READ_FAILED");
  }
  return safeStatus(payload,expectedDay);
}

export async function runProductionB2D1RuntimeAcceptance({
  env=process.env,
  fetchImpl=fetch,
  createB2ClientImpl=createB2Client,
  createGovernorImpl=createB2D1AccountGovernor,
  now=()=>new Date(),
}={}){
  const {runId,attempt,workflowId}=requiredConfig(env);
  const startedAt=now();
  if(!(startedAt instanceof Date)||!Number.isFinite(startedAt.getTime()))
    fail("RUNTIME_CLOCK_INVALID");
  const day=startedAt.toISOString().slice(0,10);
  const governor=createGovernorImpl({env,fetchImpl,now:()=>new Date(startedAt)});
  const workerBefore=await readControlPlaneQuotaStatus({env,fetchImpl,expectedDay:day});
  const before=safeStatus(await governor.status(),day);
  // Reserve a bounded maximum of eight attempts (including native-read fallback)
  // before attempting any storage call. This is admission only, not a reservation.
  const limits=before.limits,used=before.used;
  if(used.total+8>limits.total||used.GET+4>limits.GET||
    used.PUT+2>limits.PUT||used.NATIVE_AUTH+2>limits.NATIVE_AUTH)
    fail("B2_SHARED_D1_QUOTA_HEADROOM_INSUFFICIENT");

  const b2=createB2ClientImpl({
    endpointUrl:B2_ENDPOINT,bucket:BUCKET,
    accessKey:env.B2_KEY_ID,secretKey:env.B2_APPLICATION_KEY,
    allowedKeyPrefixes:["geomacro-evidence/v1/"],
  });
  const key=PREFIX+`${runId}-${attempt}.json`;
  const payload=Buffer.from(JSON.stringify({
    schema:"geomacro.production-b2-d1-runtime-probe.v1",
    run_id:runId,run_attempt:attempt,created_at:startedAt.toISOString(),
    nonce:randomUUID(),purpose:"configuration-acceptance-only",
    source_data_written:false,payment_attempted:false,
  })+"\n","utf8");
  if(payload.length>1024)fail("RUNTIME_PROBE_PAYLOAD_BOUNDS_INVALID");
  const expected=sha256(payload);
  let writeReceipt;
  try{writeReceipt=await b2.putWithMetadataVerification(key,payload);}
  catch(error){fail("B2_PUT_OR_FULL_READBACK_FAILED:"+classifyB2ProbeProviderFailure(error));}
  if(writeReceipt?.full_body_readback_verified!==true||
    writeReceipt?.verification_mode!=="signed-put-full-readback-sha256"||
    writeReceipt?.sha256!==expected||writeReceipt?.bytes!==payload.length)
    fail("B2_PUT_FULL_READBACK_RECEIPT_INVALID");

  let readback;
  try{readback=Buffer.from(await b2.get(key));}
  catch(error){fail("B2_SECOND_INDEPENDENT_GET_FAILED:"+classifyB2ProbeProviderFailure(error));}
  if(readback.length!==payload.length||sha256(readback)!==expected||
    !readback.equals(payload))
    fail("B2_SECOND_INDEPENDENT_READBACK_MISMATCH");

  const after=safeStatus(await governor.status(),day);
  const workerAfter=await readControlPlaneQuotaStatus({env,fetchImpl,expectedDay:day});
  if(after.used.total<before.used.total+3||
    after.used.GET<before.used.GET+2||
    after.used.PUT<before.used.PUT+1)
    fail("D1_ACCOUNT_QUOTA_COUNTER_READBACK_DID_NOT_ADVANCE");
  if(workerAfter.used.total<workerBefore.used.total+3||
    workerAfter.used.GET<workerBefore.used.GET+2||
    workerAfter.used.PUT<workerBefore.used.PUT+1)
    fail("CONTROL_PLANE_D1_COUNTER_READBACK_DID_NOT_ADVANCE");

  const rows=await d1Query({
    env,fetchImpl,
    sql:"SELECT operation, requests FROM b2_request_quota_workflow_receipt WHERE day_utc = ? AND workflow_id = ? AND operation IN ('GET','PUT') ORDER BY operation",
    params:[day,workflowId],
  });
  const counts=Object.fromEntries(rows.map((row)=>[
    String(row.operation??""),Number(row.requests),
  ]));
  if(!integer(counts.GET)||counts.GET<2||!integer(counts.PUT)||counts.PUT<1)
    fail("D1_PER_RUN_WRITE_READBACK_RECEIPT_MISSING");

  return Object.freeze({
    schema:"geomacro.production-b2-d1-runtime-acceptance.v1",
    status:"PASS",
    test_scope:"REAL_PRODUCTION_B2_PUT_FULL_GET_AND_REPEAT_GET_PLUS_D1_QUOTA_WRITE_READBACK",
    b2:{
      put_verified:true,
      full_body_readback_verified:true,
      second_independent_get_verified:true,
      sha256_match:true,
      bytes:payload.length,
      diagnostic_object_key_withheld:true,
      sha256:expected,
    },
    d1:{
      quota_status_read_before_and_after:true,
      authenticated_control_plane_d1_read_before_and_after:true,
      per_run_write_receipts_read_back:true,
      get_request_receipts:counts.GET,
      put_request_receipts:counts.PUT,
      global_counters_advanced:true,
      day_utc:day,
    },
    supabase_requests:0,
    payment_attempts:0,
    customer_or_source_data_written:false,
    current_signed_hot_products_verified:false,
    note:"Runtime credentials and the authenticated Control Plane D1 binding are accepted only for this bounded B2/D1 probe. Signed product freshness, source rights, signatures and public deep health are separate gates.",
  });
}

if(import.meta.url===`file://${process.argv[1]??""}`){
  if(process.argv.length!==3||process.argv[2]!=="--no-funds-runtime-test"){
    console.error("RUNTIME_ACCEPTANCE_EXPLICIT_MODE_REQUIRED");
    process.exitCode=2;
  }else{
    try{
      const result=await runProductionB2D1RuntimeAcceptance();
      process.stdout.write(JSON.stringify(result)+"\n");
    }catch(error){
      const message=error instanceof Error?error.message:"";
      const safe=/^[A-Z0-9_,:-]{1,160}$/.test(message)
        ?message:"PRODUCTION_B2_D1_RUNTIME_ACCEPTANCE_FAILED";
      process.stderr.write(JSON.stringify({
        schema:"geomacro.production-b2-d1-runtime-acceptance.v1",
        status:"FAIL",reason:safe,secret_values_printed:false,
      })+"\n");
      process.exitCode=1;
    }
  }
}
