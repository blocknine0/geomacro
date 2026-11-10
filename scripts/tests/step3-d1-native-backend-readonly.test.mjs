import {test} from "node:test";
import assert from "node:assert/strict";
import {summarizeD1BackendMetadata,diagnoseStep3D1BackendReadOnly}
 from "../ops/step3-d1-native-backend-readonly.mjs";

const db="db057ca9-9f6e-4957-ac28-144f3b798f9b";
const env={
 D1_DATABASE_ID:db,CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),
 CLOUDFLARE_API_TOKEN:"offline-fixture-token-minimum-length",
 GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"blocknine0/geomacro",
 GITHUB_REF:"refs/heads/main"
};
test("offline: native backend metadata preserves source shape and never claims bookmark",()=>{
 assert.deepEqual(summarizeD1BackendMetadata({version:"production"}),{
  info_response_shape:"OBJECT",version_label:"production",
  reported_version_known:true,time_travel_bookmark_proven:false,
  production_ddl_authorized:false
 });
 assert.equal(summarizeD1BackendMetadata([{version:"beta"}]).version_label,"beta");
 assert.equal(summarizeD1BackendMetadata({result:{version:"alpha"}}).version_label,"alpha");
 assert.equal(summarizeD1BackendMetadata({}).version_label,"UNREPORTED");
 assert.equal(summarizeD1BackendMetadata({version:"unexpected"}).version_label,"UNRECOGNIZED");
 assert.throws(()=>summarizeD1BackendMetadata([{version:"beta"},{version:"alpha"}]),
  /STEP3_D1_DIAGNOSTIC_CONFLICTING_BACKEND_LABELS/u);
});
function command(info){
 return (_binary,args)=>{
  if(args.includes("list"))return JSON.stringify([{uuid:db,name:"geomacro-control-plane"}]);
  if(args.includes("info"))return JSON.stringify(info);
  throw Error("MUTATING_COMMAND_MUST_NOT_RUN");
 };
}
const success=async (_url,req)=>{
 assert.equal(req.method,"GET");
 assert.match(req.headers.Authorization,/^Bearer /u);
 return {status:200,redirected:false,json:async()=>({
  success:true,result:{bookmark:"00000085-0000024c-00004c6d-8e61"}
 })};
};
test("offline: immutable native Time Travel capability requires canonical UUID and a real provider bookmark",async()=>{
 const output=await diagnoseStep3D1BackendReadOnly({
  env,command:command({result:{version:"production"}}),fetchImpl:success
 });
 assert.equal(output.status,"PASS_READONLY_NATIVE_TIME_TRAVEL_CAPABILITY");
 assert.equal(output.canonical_database_uuid_verified,true);
 assert.equal(output.native_time_travel_bookmark_observed,true);
 assert.equal(output.recovery_checkpoint_created,false);
 assert.equal(output.d1_sql_executed,false);
 assert.equal(output.stage2_release_authorized,false);
 assert.equal(output.production_migrations_applied,false);
 assert.equal(output.canary_hold_unchanged,true);
 assert.equal(JSON.stringify(output).includes("00000085"),false);
});
test("offline: alpha, unsupported provider JSON and invalid bookmark are HOLD",async()=>{
 const cases=[
  {info:{version:"alpha"},fetchImpl:success},
  {info:{version:"unknown"},fetchImpl:success},
  {info:{version:"production"},fetchImpl:async()=>({status:403})},
  {info:{version:"production"},fetchImpl:async()=>({
   status:200,redirected:false,json:async()=>({success:true,result:{bookmark:"bad"}})
  })}
 ];
 for(const item of cases){
  const r=await diagnoseStep3D1BackendReadOnly({
   env,command:command(item.info),fetchImpl:item.fetchImpl
  });
  assert.equal(r.status,"HOLD");
  assert.equal(r.production_migrations_applied,false);
  assert.equal(r.stage2_release_authorized,false);
 }
});
test("offline: wrong identity and missing credentials reject without provider or D1 access",async()=>{
 let calls=0;
 const never=()=>{calls++;throw Error("must not call")};
 await assert.rejects(diagnoseStep3D1BackendReadOnly({
  env:{...env,GITHUB_REF:"refs/heads/other"},command:never,fetchImpl:never
 }),/STEP3_D1_DIAGNOSTIC_PROTECTED_IDENTITY_OR_CREDENTIAL_MISSING/u);
 assert.equal(calls,0);
 await assert.rejects(diagnoseStep3D1BackendReadOnly({
  env,command:(...args)=>{
   if(args[1].includes("list"))return JSON.stringify([{uuid:db,name:"WRONG"}]);
   return "{}";
  },fetchImpl:never
 }),/STEP3_D1_DIAGNOSTIC_PRODUCTION_UUID_AND_NAME_UNVERIFIED/u);
 assert.equal(calls,0);
});
