import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {sealPrivatePhase2iSourceBacklog} from "../lib/phase2i-encrypted-source-backlog.mjs";
import {runPhase2iCiphertextB2Archive} from "../ops/phase2i-archive-ciphertext-queue-b2.mjs";
const NOW=new Date("2026-11-04T08:30:00.000Z");
const ROOT="unit-test-geomacro-private-encryption-root-only-0000000000";
test("governed B2 source queue writes one indexed bulk object and exactly one body GET",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"phase2i-one-bulk-"));
 try{
  const event=join(dir,"event.json");
  writeFileSync(event,JSON.stringify({schedule:"29 0,6,12,18 * * *"}));
  const candidates=Array.from({length:100},(_,i)=>({
   category:"geopolitics",title:"Publisher news topic "+i,
   articleUrl:"https://example.org/press/"+i,
   publishedAt:"2026-11-04T08:00:00.000Z",sourceId:"issuer",
   sourceUrl:"https://example.org/rss",credit:null,
   issuerContextCountryIso3:null,d1Acknowledged:false
  }));
  const envelope=sealPrivatePhase2iSourceBacklog({
   candidates,root:ROOT,now:NOW.getTime()-3_600_000
  });
  let put=0,verifiedGet=0,extraGet=0;
  const env={
   GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"blocknine0/geomacro",
   GITHUB_REF:"refs/heads/main",GITHUB_EVENT_NAME:"schedule",
   GITHUB_WORKFLOW_REF:"blocknine0/geomacro/.github/workflows/phase2h-private-raw-archive.yml@refs/heads/main",
   GITHUB_EVENT_PATH:event,GITHUB_RUN_ID:"41787752541",
   PHASE2H_PROVIDER_MAINTENANCE:"true",
   B2_ACCOUNT_QUOTA_REQUIRED:"1",B2_ACCOUNT_QUOTA_WORKFLOW_ID:"derived_news_backup",
   B2_REQUEST_BUDGET:"10",GEOMACRO_COMMERCE_LEDGER_TOKEN:ROOT,
   CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),CLOUDFLARE_API_TOKEN:"b".repeat(45),
   B2_KEY_ID:"placeholder-write",B2_APPLICATION_KEY:"placeholder-write-secret"
  };
  const r=await runPhase2iCiphertextB2Archive({
   env,now:NOW,artifactReader:async()=>({envelope,sourceRunId:41787752541}),
   fetchImpl:async url=>{
    assert.match(url,/api.cloudflare.com\/client\/v4\/accounts/u);
    return Response.json({success:true,result:[{
     name:"geomacro-control-plane",uuid:"00000000-0000-4000-8000-000000000001"
    }]});
   },
   governorFactory:()=>({status:async()=>({ok:true,
    used:{total:1,GET:1,PUT:1,NATIVE_AUTH:1},
    limits:{total:100,GET:100,PUT:100,NATIVE_AUTH:100}})}),
   lifecycleVerifier:async()=>({
    phase2i_source_queue_prefix_verified:true,
    private_72h_delete_lifecycle_verified:true,no_bucket_mutation:true
   }),
   b2Factory:()=>({
    async putWithMetadataVerification(_key,bytes,{verifyRestored}){
     put++;verifiedGet++;
     assert.equal(verifyRestored(Buffer.from(bytes)),true);
     return {full_body_readback_verified:true,
      sha256:(await import("node:crypto")).createHash("sha256").update(bytes).digest("hex"),
      bytes:bytes.length};
    },
    async get(){extraGet++;throw Error("EXTRA_B2_GET_FORBIDDEN")}
   })
  });
  assert.equal(r.status,"B2_ENCRYPTED_SOURCE_QUEUE_ONE_PUT_ONE_GET_SHA_VERIFIED");
  assert.equal(r.candidate_count,100);
  assert.equal(r.b2_puts_for_all_fragments,1);
  assert.equal(r.b2_gets_for_readback,1);
  assert.equal(r.b2_one_independent_get_verified,true);
  assert.equal(r.b2_second_get_performed,false);
  assert.equal(put,1);assert.equal(verifiedGet,1);assert.equal(extraGet,0);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
