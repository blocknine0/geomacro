import test from "node:test";
import assert from "node:assert/strict";
import {createHash,createHmac} from "node:crypto";
import {readFileSync} from "node:fs";
import {runProductionB2D1RuntimeAcceptance,classifyB2ProbeProviderFailure} from "../ops/verify-production-b2-d1-runtime-acceptance.mjs";

const sha=(bytes)=>createHash("sha256").update(bytes).digest("hex");
const testSecrets={
  B2_KEY_ID:"synthetic-b2-key-id",
  B2_APPLICATION_KEY:"synthetic-b2-application-key",
  CLOUDFLARE_ACCOUNT_ID:"synthetic-cloudflare-account",
  CLOUDFLARE_API_TOKEN:"synthetic-cloudflare-api-token",
  D1_DATABASE_ID:"synthetic-d1-id",
  GEOMACRO_COMMERCE_LEDGER_TOKEN:"synthetic-commerce-ledger-root-token",
};
const baseEnv={
  ...testSecrets,
  GITHUB_ACTIONS:"true",
  GITHUB_REPOSITORY:"blocknine0/geomacro",
  GITHUB_REF:"refs/heads/main",
  GITHUB_RUN_ID:"123456789012",
  GITHUB_RUN_ATTEMPT:"1",
  B2_ACCOUNT_QUOTA_REQUIRED:"1",
  B2_ACCOUNT_QUOTA_WORKFLOW_ID:"runtime_probe_123456789012_1",
  B2_REQUEST_BUDGET:"8",
};
const status=(used)=>({
  ok:true,schema:"geomacro.b2-account-quota-status.v1",
  day_utc:"2026-10-25",
  used:{total:used.total,GET:used.GET,PUT:used.PUT,HEAD:used.HEAD,NATIVE_AUTH:used.NATIVE_AUTH},
  limits:{total:100,GET:45,PUT:55,HEAD:10,NATIVE_AUTH:10},
  account_wide_reporting_requires_all_clients_governed:true,
});
const before=status({total:10,GET:5,PUT:3,HEAD:1,NATIVE_AUTH:1});
const after=status({total:13,GET:7,PUT:4,HEAD:1,NATIVE_AUTH:1});

test("successful acceptance requires real-operation receipts plus byte-perfect repeated readback",async()=>{
  let statusCalls=0,workerStatusCalls=0,stored=null,optionsSeen=null,querySeen=null,workerAuthorization=null;
  const fakeB2={
    async putWithMetadataVerification(key,bytes){
      assert.match(key,/^geomacro-evidence\/v1\/private\/runtime-config-acceptance\//);
      stored=Buffer.from(bytes);
      return {sha256:sha(stored),bytes:stored.length,
        verification_mode:"signed-put-full-readback-sha256",
        full_body_readback_verified:true};
    },
    async get(key){
      assert.match(key,/^geomacro-evidence\/v1\/private\/runtime-config-acceptance\//);
      return Buffer.from(stored);
    },
  };
  const result=await runProductionB2D1RuntimeAcceptance({
    env:baseEnv,
    now:()=>new Date("2026-10-25T18:00:00.000Z"),
    createGovernorImpl:()=>({async status(){statusCalls++;return statusCalls===1?before:after;}}),
    createB2ClientImpl:(options)=>{optionsSeen=options;return fakeB2;},
    fetchImpl:async(url,init)=>{
      if(String(url).endsWith("/v1/b2-quota/status")){
        workerStatusCalls++;
        workerAuthorization=init.headers.authorization;
        return {ok:true,status:200,json:async()=>workerStatusCalls===1?before:after};
      }
      querySeen={url:String(url),body:JSON.parse(init.body),authorization:init.headers.authorization};
      return {ok:true,json:async()=>({success:true,result:[{success:true,results:[
        {operation:"GET",requests:2},{operation:"PUT",requests:1},
      ]}]})};
    },
  });
  assert.equal(result.status,"PASS");
  assert.equal(result.b2.put_verified,true);
  assert.equal(result.b2.full_body_readback_verified,true);
  assert.equal(result.b2.second_independent_get_verified,true);
  assert.equal(result.d1.authenticated_control_plane_d1_read_before_and_after,true);
  assert.equal(result.d1.per_run_write_receipts_read_back,true);
  assert.equal(result.d1.get_request_receipts,2);
  assert.equal(result.d1.put_request_receipts,1);
  assert.equal(statusCalls,2);
  assert.equal(stored.length,result.b2.bytes);
  assert.equal(optionsSeen.accessKey,testSecrets.B2_KEY_ID);
  assert.equal(optionsSeen.secretKey,testSecrets.B2_APPLICATION_KEY);
  assert.equal(querySeen.body.params[1],baseEnv.B2_ACCOUNT_QUOTA_WORKFLOW_ID);
  assert.match(querySeen.body.sql,/b2_request_quota_workflow_receipt/);
  assert.equal(querySeen.authorization,`Bearer ${testSecrets.CLOUDFLARE_API_TOKEN}`);
  assert.equal(workerAuthorization,`Bearer ${createHmac("sha256",testSecrets.GEOMACRO_COMMERCE_LEDGER_TOKEN).update("geomacro-control-plane-v1").digest("hex")}`);
  assert.equal(workerStatusCalls,2);
  const printed=JSON.stringify(result);
  for(const secret of Object.values(testSecrets))assert.equal(printed.includes(secret),false);
  assert.equal(printed.includes("geomacro-evidence/v1/private/runtime-config-acceptance/"),false);
});

test("missing owner secrets are named but values are never requested or printed",async()=>{
  const env={...baseEnv,B2_KEY_ID:""};
  await assert.rejects(
    ()=>runProductionB2D1RuntimeAcceptance({
      env,createGovernorImpl:()=>{throw Error("must not connect");},
      createB2ClientImpl:()=>{throw Error("must not connect");},
    }),
    (error)=>error.message==="PRODUCTION_B2_D1_CONFIGURATION_MISSING:B2_KEY_ID",
  );
});

test("Supabase and money-enabled environments are rejected before any runtime call",async()=>{
  for(const forbidden of ["SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","COINBASE_API_KEY",
    "COINBASE_X402_MAINNET_ACK","GEOMACRO_COMMERCIAL_LAUNCH_ACK"]){
    await assert.rejects(
      ()=>runProductionB2D1RuntimeAcceptance({
        env:{...baseEnv,[forbidden]:"must-never-be-used"},
        createGovernorImpl:()=>{throw Error("must not connect");},
        createB2ClientImpl:()=>{throw Error("must not connect");},
      }),
      (error)=>error.message==="SUPABASE_OR_PAYMENT_BOUNDARY_VIOLATED",
    );
  }
});

test("no D1 receipt means no PASS, even if the B2 body is byte-perfect",async()=>{
  let statusCalls=0,workerStatusCalls=0,stored=null;
  await assert.rejects(
    ()=>runProductionB2D1RuntimeAcceptance({
      env:baseEnv,now:()=>new Date("2026-10-25T18:00:00.000Z"),
      createGovernorImpl:()=>({async status(){statusCalls++;return statusCalls===1?before:after;}}),
      createB2ClientImpl:()=>({
        async putWithMetadataVerification(key,body){
          assert.ok(key.startsWith("geomacro-evidence/v1/private/runtime-config-acceptance/"));
          stored=Buffer.from(body);
          return {sha256:sha(body),bytes:body.length,
            verification_mode:"signed-put-full-readback-sha256",
            full_body_readback_verified:true};
        },
        async get(){return Buffer.from(stored);},
      }),
      fetchImpl:async(url,init)=>{
        if(String(url).endsWith("/v1/b2-quota/status")){
          workerStatusCalls++;
          return {ok:true,status:200,json:async()=>workerStatusCalls===1?before:after};
        }
        return {ok:true,json:async()=>({success:true,result:[{success:true,results:[
          {operation:"GET",requests:0},{operation:"PUT",requests:0},
        ]}]})};
      },
    }),
    (error)=>error.message==="D1_PER_RUN_WRITE_READBACK_RECEIPT_MISSING",
  );
});

test("Phase 2B safely separates B2 provider and integrity failure categories",()=>{
  const pairs=[
    ["B2_PUT_FAILED_403_AccessDenied","B2_CREDENTIAL_OR_BUCKET_SCOPE_DENIED"],
    ["B2_NATIVE_AUTHORIZE_FAILED_401_unauthorized","B2_CREDENTIALS_REJECTED"],
    ["B2_NATIVE_READ_BUCKET_NOT_ALLOWED","B2_CREDENTIAL_OR_BUCKET_SCOPE_DENIED"],
    ["B2_PUT_FAILED_403_transaction_cap_exceeded","B2_PROVIDER_CAP_EXCEEDED"],
    ["B2_GET_FAILED_404_NoSuchKey","B2_OBJECT_NOT_FOUND"],
    ["B2_GET_FAILED_429_TooManyRequests","B2_PROVIDER_RATE_LIMIT"],
    ["B2_REQUEST_BUDGET_EXHAUSTED","B2_D1_QUOTA_DENIED"],
    ["B2_PUT_FAILED_503_ServiceUnavailable","B2_PROVIDER_TRANSIENT_EXHAUSTED"],
    ["B2_READBACK_SHA256_MISMATCH","B2_BYTE_INTEGRITY_MISMATCH"],
    ["B2_NATIVE_GET_NETWORK_FAILED","B2_NETWORK_UNAVAILABLE"],
    ["irrelevant-sensitive-input","B2_FAILURE_NOT_YET_CLASSIFIED"],
  ];
  for(const [raw,expected] of pairs)
    assert.equal(classifyB2ProbeProviderFailure(new Error(raw)),expected);
});

test("Phase 2B prints an allowlisted code, not the raw B2 error stream",()=>{
  const workflow=readFileSync(".github/workflows/production-b2-d1-runtime-readwrite-acceptance.yml","utf8");
  const verifier=readFileSync("scripts/ops/verify-production-b2-d1-runtime-acceptance.mjs","utf8");
  assert.ok(workflow.includes("if ! bun scripts/ops/verify-production-b2-d1-runtime-acceptance.mjs"));
  assert.ok(workflow.includes("geomacro.phase2b.protected-diagnostic.v1"));
  assert.ok(workflow.includes("B2_RUNTIME_FAILURE_UNCLASSIFIED"));
  assert.ok(!workflow.includes("cat /tmp/geomacro-runtime-acceptance.stderr"));
  assert.ok(verifier.includes("classifyB2ProbeProviderFailure(error)"));
});

test("Phase 2C distinguishes owner B2 PUT denial from first verification GET denial without extra requests",async()=>{
  for(const phase of ["INITIAL_PUT","FIRST_VERIFICATION_GET"]){
    let calls=0;
    await assert.rejects(
      ()=>runProductionB2D1RuntimeAcceptance({
        env:baseEnv,now:()=>new Date("2026-10-25T18:00:00.000Z"),
        createGovernorImpl:()=>({async status(){return before;}}),
        createB2ClientImpl:()=>({
          async putWithMetadataVerification(_key,_payload,{onStage}){
            calls++;
            onStage("INITIAL_PUT");
            if(phase==="FIRST_VERIFICATION_GET")onStage("FIRST_VERIFICATION_GET");
            throw new Error("B2_PUT_FAILED_403_AccessDenied");
          },
          async get(){throw Error("DO_NOT_GET_AFTER_DENIED_PROBE");},
        }),
        fetchImpl:async()=>({ok:true,status:200,json:async()=>before}),
      }),
      error=>error.message==="B2_"+phase+"_FAILED:B2_CREDENTIAL_OR_BUCKET_SCOPE_DENIED",
    );
    assert.equal(calls,1);
  }
});

test("Phase 2C safe production failure codes remain tightly allowlisted",()=>{
 const workflow=readFileSync(".github/workflows/production-b2-d1-runtime-readwrite-acceptance.yml","utf8");
 const client=readFileSync("scripts/ops/b2-s3-client.mjs","utf8");
 const verifier=readFileSync("scripts/ops/verify-production-b2-d1-runtime-acceptance.mjs","utf8");
 assert.ok(workflow.includes("B2_INITIAL_PUT_FAILED|B2_FIRST_VERIFICATION_GET_FAILED|B2_SECOND_INDEPENDENT_GET_FAILED"));
 assert.ok(client.includes('onStage("INITIAL_PUT")'));
 assert.ok(client.includes('onStage("FIRST_VERIFICATION_GET")'));
 assert.ok(verifier.includes("B2_"+'storageStage+"_FAILED:'));
 assert.ok(!workflow.includes("cat /tmp/geomacro-runtime-acceptance.stderr"));
});
