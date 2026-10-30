import test from "node:test";
import assert from "node:assert/strict";
import {checkB2VersionsPage,verifyPhase2hB2VersionInventory} from "../ops/phase2h-independent-b2-version-census.mjs";
import {PHASE2H_B2_PREFIX} from "../ops/phase2h-verify-b2-72h-lifecycle.mjs";
const now=new Date("2026-10-30T14:00:00Z");
const name=PHASE2H_B2_PREFIX+"2026/10/30/"+ "a".repeat(64)+".json.gz";
const row=(ts,action="upload")=>({fileName:name,fileId:"4_zlong_file_id",action,uploadTimestamp:ts});
const env={GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"blocknine0/geomacro",
 GITHUB_REF:"refs/heads/main",B2_ACCOUNT_QUOTA_REQUIRED:"1",
 B2_ACCOUNT_QUOTA_WORKFLOW_ID:"phase2h_b2_retention",
 B2_KEY_ID:"x".repeat(14),B2_APPLICATION_KEY:"z".repeat(24)};
const exactRule={fileNamePrefix:PHASE2H_B2_PREFIX,
 daysFromUploadingToHiding:1,daysFromHidingToDeleting:1};
const auth={authorizationToken:"secret","accountId":"a".repeat(16),
 apiInfo:{storageApi:{apiUrl:"https://api004.backblazeb2.com",
  allowed:{capabilities:["listBuckets","listFiles"]}}}};
const bucket={buckets:[{bucketName:"geomacro-private-archive",
 bucketId:"b1",lifecycleRules:[exactRule]}]};
const make=(docs)=>{
 let calls=0,tickets=[];
 const governor={reserve:async kind=>{tickets.push(kind);}};
 const fetchImpl=async()=>({status:200,redirected:false,
  json:async()=>docs[calls++]});
 return {governor,fetchImpl,tickets,get calls(){return calls}};
};
test("current B2 scoped version inventory proves no overdue versions, not historical deletion",async()=>{
 const m=make([auth,bucket,{files:[row(now.getTime()-3600000)],nextFileName:null,nextFileId:null}]);
 const r=await verifyPhase2hB2VersionInventory({env,now,fetchImpl:m.fetchImpl,governor:m.governor});
 assert.equal(r.status,"CURRENT_PREFIX_NO_OVERDUE_VERSIONS");
 assert.equal(r.live_versions,1);assert.equal(r.versions_older_than_72h,0);
 assert.equal(r.past_versions_independently_deleted,false);
 assert.equal(r.archive_put_get_readback_verified_by_this_audit,false);
 assert.deepEqual(m.tickets,["NATIVE_AUTH","GET","GET"]);
});
test("empty prefix does not claim archive ever happened",async()=>{
 const m=make([auth,bucket,{files:[],nextFileName:null,nextFileId:null}]);
 const r=await verifyPhase2hB2VersionInventory({env,now,fetchImpl:m.fetchImpl,governor:m.governor});
 assert.equal(r.status,"EMPTY_PREFIX_NO_ARCHIVE_PROOF");
});
test("late stored version remains a provider-visible retention failure",async()=>{
 const m=make([auth,bucket,{files:[row(now.getTime()-73*3600000)],nextFileName:null,nextFileId:null}]);
 const r=await verifyPhase2hB2VersionInventory({env,now,fetchImpl:m.fetchImpl,governor:m.governor});
 assert.equal(r.status,"OVERDUE_B2_FILE_VERSIONS_PRESENT");
 assert.equal(r.versions_older_than_72h,1);
});
test("source names outside the exact private prefix are never silently counted",()=>{
 assert.throws(()=>checkB2VersionsPage({files:[{...row(now.getTime()),fileName:"other/"+name}]},now),
  /UNRECOGNIZED_PREFIX_VERSION/u);
 assert.throws(()=>checkB2VersionsPage({files:[row(Date.now()+9999999999999)]},now),
  /VERSION_CLOCK_INVALID/u);
});
test("native v4 accepts safe provider-issued non-hex account IDs, rejects malformed IDs",async()=>{
 const providerAuth={...auth,accountId:"account_key-2026"};
 const m=make([providerAuth,bucket,{files:[],nextFileName:null,nextFileId:null}]);
 const good=await verifyPhase2hB2VersionInventory({env,now,fetchImpl:m.fetchImpl,governor:m.governor});
 assert.equal(good.provider_lifecycle_exact_prefix_verified,true);
 const malformed=make([{...auth,accountId:"bad?request=1"}]);
 await assert.rejects(verifyPhase2hB2VersionInventory({env,now,fetchImpl:malformed.fetchImpl,
  governor:malformed.governor}),/PROVIDER_ACCOUNT_ID_UNVERIFIED/u);
});
test("missing lifecycle or listFiles capability refuses positive proof",async()=>{
 const m=make([{...auth,apiInfo:{storageApi:{...auth.apiInfo.storageApi,
  allowed:{capabilities:["listBuckets"]}}}},bucket]);
 await assert.rejects(verifyPhase2hB2VersionInventory({env,now,fetchImpl:m.fetchImpl,governor:m.governor}),
  /PROVIDER_LIST_FILES_CAPABILITY_MISSING/u);
 assert.equal(m.calls,1);
 const absent=make([auth,{buckets:[{...bucket.buckets[0],lifecycleRules:[]}]}]);
 await assert.rejects(verifyPhase2hB2VersionInventory({env,now,fetchImpl:absent.fetchImpl,governor:absent.governor}),
  /THREE_DAY_EXPIRY_NOT_PROVEN/u);
});
test("existing archive-read principal is used for provider inventory without widening writer key",async()=>{
 const extendedEnv={...env,B2_ARCHIVE_READ_KEY_ID:"read".repeat(5),
  B2_ARCHIVE_READ_APPLICATION_KEY:"s".repeat(24)};
 const seen=[];
 const docs=[auth,bucket,{files:[],nextFileName:null,nextFileId:null}];
 const r=await verifyPhase2hB2VersionInventory({env:extendedEnv,now,
  fetchImpl:async(_url,options)=>{seen.push(options?.headers?.Authorization);return{
   status:200,redirected:false,json:async()=>docs[seen.length-1]};},
  governor:{reserve:async()=>{}}});
 assert.equal(r.existing_credential_used,"ARCHIVE_READ");
 assert.match(seen[0],/^Basic /u);
 assert.equal(Buffer.from(seen[0].slice(6),"base64").toString("utf8"),
  extendedEnv.B2_ARCHIVE_READ_KEY_ID+":"+extendedEnv.B2_ARCHIVE_READ_APPLICATION_KEY);
});
test("quota hold occurs before B2 network call, off-main fails closed",async()=>{
 let calls=0;
 const fetchImpl=async()=>{calls++;throw Error("network should be untouched")};
 await assert.rejects(verifyPhase2hB2VersionInventory({env,now,fetchImpl,
  governor:{reserve:async()=>{throw Error("B2_GLOBAL_DAILY_QUOTA_EXHAUSTED")}}}),
  /B2_GLOBAL_DAILY_QUOTA_EXHAUSTED/u);
 assert.equal(calls,0);
 await assert.rejects(verifyPhase2hB2VersionInventory({env:{...env,GITHUB_REF:"refs/heads/PR"},now,fetchImpl,
  governor:{reserve:async()=>{}}}),/PROTECTED_MAIN_REQUIRED/u);
 assert.equal(calls,0);
});
test("all version pages must complete; malformed cursor fails closed",()=>{
 assert.throws(()=>checkB2VersionsPage({files:[],nextFileName:name,nextFileId:null},now),
  /PAGINATION_INVALID/u);
});
