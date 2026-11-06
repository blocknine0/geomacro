import test from "node:test";
import assert from "node:assert/strict";
import {parseBucketList,digestManifest,currentParityReceipt} from "../ops/hot50-parity-proof.mjs";
import {createB2Client} from "../ops/b2-s3-client.mjs";
const prefix="geomacro-evidence/v1/spool/";
const xml=(extra="",truncated="false")=>Buffer.from(`<ListBucketResult><EncodingType>url</EncodingType><KeyCount>1</KeyCount><IsTruncated>${truncated}</IsTruncated><Contents><Key>geomacro-evidence%2Fv1%2Fspool%2Fx.gz</Key></Contents>${extra}</ListBucketResult>`);
test("physical list validates encoding, full pagination cursor and prefix",()=>{
 assert.deepEqual(parseBucketList(xml(),prefix),{keys:[prefix+"x.gz"],cursor:null,complete:true});
 assert.equal(parseBucketList(xml('<NextContinuationToken>a&amp;b</NextContinuationToken>',"true"),prefix).cursor,"a&b");
 assert.equal(parseBucketList(xml('<NextContinuationToken>a&amp;lt;b</NextContinuationToken>',"true"),prefix).cursor,"a&lt;b");
 assert.throws(()=>parseBucketList(xml("","true"),prefix));
 assert.throws(()=>parseBucketList(xml(),"other/"));
 assert.throws(()=>parseBucketList(Buffer.from('<!DOCTYPE x>'+xml()),prefix));
});
test("B2 URL-encoded keys are decoded once; XML entities and bad escapes fail closed",()=>{
 const document=encoded=>Buffer.from(`<ListBucketResult><EncodingType>url</EncodingType><KeyCount>1</KeyCount><IsTruncated>false</IsTruncated><Contents><Key>${encoded}</Key></Contents></ListBucketResult>`);
 const path="geomacro-evidence%2Fv1%2Fspool%2F";
 // Percent-encoded ampersand followed by XML-looking text is literal key data,
 // not a second instruction to unescape a different object name.
 assert.equal(parseBucketList(document(path+"a%26amp%3Bb"),prefix).keys[0],prefix+"a&amp;b");
 // A literal percent sequence must not be recursively decoded into a slash.
 assert.equal(parseBucketList(document(path+"a%252Fb"),prefix).keys[0],prefix+"a%2Fb");
 assert.throws(()=>parseBucketList(document(path+"a&amp;b"),prefix),/B2_LIST_KEY_ENTITY_INVALID/);
 assert.throws(()=>parseBucketList(document(path+"a&#38;b"),prefix),/B2_LIST_KEY_ENTITY_INVALID/);
 assert.throws(()=>parseBucketList(document(path+"bad%ZZ"),prefix),/B2_LIST_KEY_PERCENT_ENCODING_INVALID/);
});
test("count-preserving canonical substitutions change the manifest commitment",()=>{
 const a={batch_id:"a",b2_uri:"b2://x",b2_object_sha256:"c",item_count:2};
 assert.notEqual(digestManifest([a]),digestManifest([{...a,b2_object_sha256:"d"}]));
 assert.equal(digestManifest([a,{...a,batch_id:"b"}]),digestManifest([{...a,batch_id:"b"},a]));
});
test("stale, foreign-run and changed-count receipts never pass",()=>{
 const opts={census:{backlog:{outbox:0,archived_outboxes:1,exact_bundle_journal_mismatch:0}},origin:"https://x.workers.dev",head:"a".repeat(40),run:"123",now:1000000};
 const b={schema:"geomacro.hot50-storage-readback.v1",status:"PASS",control_plane_origin:opts.origin,
  head_sha:opts.head,run_id:opts.run,checked_at:new Date(opts.now).toISOString(),stable_d1_manifest_verified:true,
  coverage_scope:"ARCHIVED_ENCRYPTED_P0B_OUTBOX_BATCHES",
  stable_b2_manifest_verified:true,b2_manifest_sha256:"c".repeat(64),d1_manifest_sha256:"b".repeat(64),independent_s3_get_sha256_aes_gcm_restoration:true,
  physical_bucket_list_complete:true,bidirectional_parity_pass:true,pending_outbox_batches:0,checked_archived_bundles:1,d1_archived:1};
 assert.equal(currentParityReceipt(b,opts),true);
 for(const patch of [{run_id:"122"},{checked_at:new Date(0).toISOString()},{d1_archived:2},{stable_d1_manifest_verified:false},{checked_archived_bundles:0,d1_archived:0},{pending_outbox_batches:2}])
  assert.equal(currentParityReceipt({...b,...patch},opts),false);
});
test("spool-only client permits narrower scope and rejects traversal before network",()=>{
 const options={endpointUrl:"https://s3.us-east-005.backblazeb2.com",bucket:"geomacro-private-archive",accessKey:"fake-access-key",secretKey:"fake-secret-key-value-1234567890"};
 const client=createB2Client({...options,allowedKeyPrefixes:[prefix]});
 assert.deepEqual(client.usage().allowed_prefixes,[prefix]);
 for(const bad of ["geomacro-evidence/v1/../","geomacro-evidence/v1//","other/","geomacro-evidence/v10/"])
  assert.throws(()=>createB2Client({...options,allowedKeyPrefixes:[bad]}));
});
test("bucket listing signs the canonical query and consumes the client request budget",async t=>{
 const original=globalThis.fetch,old=process.env.B2_REQUEST_BUDGET;
 process.env.B2_REQUEST_BUDGET="1";
 t.after(()=>{globalThis.fetch=original;if(old===undefined)delete process.env.B2_REQUEST_BUDGET;else process.env.B2_REQUEST_BUDGET=old});
 const calls=[];
 globalThis.fetch=async(url,opts)=>{calls.push({url,opts});return new Response(xml())};
 const b2=createB2Client({endpointUrl:"https://s3.us-east-005.backblazeb2.com",bucket:"geomacro-private-archive",
  accessKey:"fake-access-key",secretKey:"fake-secret-key-value-1234567890",allowedKeyPrefixes:[prefix]});
 assert.equal(parseBucketList(await b2.list(prefix,"a+b/c="),prefix).keys.length,1);
 const url=new URL(calls[0].url);
 assert.equal(url.pathname,"/geomacro-private-archive");
 assert.equal(url.searchParams.get("continuation-token"),"a+b/c=");
 assert.equal(url.searchParams.get("encoding-type"),"url");
 assert.match(calls[0].opts.headers.Authorization,/AWS4-HMAC-SHA256/);
 assert.equal(b2.usage().requests_started,1);
 await assert.rejects(b2.list(prefix),/B2_REQUEST_BUDGET_EXHAUSTED/);
 assert.equal(calls.length,1);
 await assert.rejects(b2.list("other/"),/B2_ARCHIVE_KEY_INVALID/);
});
