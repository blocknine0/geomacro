import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {digestManifest,currentParityReceipt} from "../ops/hot50-parity-proof.mjs";
import {createB2Client} from "../ops/b2-s3-client.mjs";

test("D1 manifest commitment is order-independent and content-sensitive",()=>{
 const a={batch_id:"a",b2_uri:"b2://x",b2_object_sha256:"c",item_count:2};
 assert.notEqual(digestManifest([a]),digestManifest([{...a,b2_object_sha256:"d"}]));
 assert.equal(digestManifest([a,{...a,batch_id:"b"}]),digestManifest([{...a,batch_id:"b"},a]));
});

test("current indexed readback accepts no-list proof but never claims physical parity",()=>{
 const opts={census:{backlog:{outbox:0,archived_outboxes:1,exact_bundle_journal_mismatch:0}},
  origin:"https://x.workers.dev",head:"a".repeat(40),run:"123",now:1000000};
 const receipt={schema:"geomacro.hot50-storage-readback.v1",status:"PASS",
  control_plane_origin:opts.origin,head_sha:opts.head,run_id:opts.run,
  checked_at:new Date(opts.now).toISOString(),coverage_scope:"ARCHIVED_ENCRYPTED_P0B_OUTBOX_BATCHES",
  stable_d1_manifest_verified:true,d1_manifest_sha256:"b".repeat(64),
  independent_s3_get_sha256_aes_gcm_restoration:true,d1_indexed_b2_readback_verified:true,
  physical_bucket_list_complete:false,bidirectional_parity_pass:false,
  checked_archived_bundles:1,pending_outbox_batches:0,d1_archived:1};
 assert.equal(currentParityReceipt(receipt,opts),true);
 assert.equal(currentParityReceipt({...receipt,physical_bucket_list_complete:true},opts),false);
 assert.equal(currentParityReceipt({...receipt,d1_indexed_b2_readback_verified:false},opts),false);
 assert.equal(currentParityReceipt({...receipt,checked_at:new Date(0).toISOString()},opts),false);
});

test("shared S3 client refuses listing before any provider request",async t=>{
 const original=globalThis.fetch;
 const old=process.env.B2_REQUEST_BUDGET;
 process.env.B2_REQUEST_BUDGET="1";
 let requests=0;
 globalThis.fetch=async()=>{requests+=1;return new Response("unexpected")};
 t.after(()=>{globalThis.fetch=original;if(old===undefined)delete process.env.B2_REQUEST_BUDGET;else process.env.B2_REQUEST_BUDGET=old});
 const client=createB2Client({endpointUrl:"https://s3.us-east-005.backblazeb2.com",bucket:"geomacro-private-archive",
  accessKey:"fake-access-key",secretKey:"fake-secret-key-value-1234567890",allowedKeyPrefixes:["geomacro-evidence/v1/spool/"]});
 assert.throws(()=>client.list("geomacro-evidence/v1/spool/"),/B2_LIST_OPERATIONS_DISABLED_USE_D1_INDEX/u);
 assert.equal(requests,0);
});

test("hot50 archive parity audit contains no bucket-list dependency",async()=>{
 const source=await readFile(new URL("../ops/audit-hot50-b2-d1-parity.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(source,/\.list\(|ListObjectsV2|list-type=2/u);
 assert.match(source,/d1_indexed_b2_readback_verified/u);
});
