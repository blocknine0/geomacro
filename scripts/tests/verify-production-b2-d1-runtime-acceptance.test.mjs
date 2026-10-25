import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {runProductionB2D1RuntimeAcceptance} from "../ops/verify-production-b2-d1-runtime-acceptance.mjs";

const sha=(bytes)=>createHash("sha256").update(bytes).digest("hex");
const testSecrets={
  B2_KEY_ID:"synthetic-b2-key-id",
  B2_APPLICATION_KEY:"synthetic-b2-application-key",
  CLOUDFLARE_ACCOUNT_ID:"synthetic-cloudflare-account",
  CLOUDFLARE_API_TOKEN:"synthetic-cloudflare-api-token",
  D1_DATABASE_ID:"synthetic-d1-id",
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
  let statusCalls=0,stored=null,optionsSeen=null,querySeen=null;
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

test("no D1 receipt means no PASS, even if the B2 body appears readable",async()=>{
  let statusCalls=0;
  const bytes=Buffer.from('{"synthetic":true}\n');
  await assert.rejects(
    ()=>runProductionB2D1RuntimeAcceptance({
      env:baseEnv,now:()=>new Date("2026-10-25T18:00:00.000Z"),
      createGovernorImpl:()=>({async status(){statusCalls++;return statusCalls===1?before:after;}}),
      createB2ClientImpl:()=>({
        async putWithMetadataVerification(key,body){
          assert.ok(key.startsWith("geomacro-evidence/v1/private/runtime-config-acceptance/"));
          // Match the real script's expected hash/length against its own payload.
          return {sha256:sha(body),bytes:body.length,
            verification_mode:"signed-put-full-readback-sha256",
            full_body_readback_verified:true};
        },
        async get(){return bytes;},
      }),
      fetchImpl:async()=>({ok:true,json:async()=>({success:true,result:[{success:true,results:[
        {operation:"GET",requests:0},{operation:"PUT",requests:0},
      ]}]})}),
    }),
    (error)=>error.message==="B2_SECOND_INDEPENDENT_READBACK_MISMATCH"||
      error.message==="D1_PER_RUN_WRITE_READBACK_RECEIPT_MISSING",
  );
});
