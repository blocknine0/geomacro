import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes,createCipheriv,createHmac} from "node:crypto";
import {gzipSync} from "node:zlib";
import {normalizeReusableNewsJson} from "../../src/lib/reusable-news-json.ts";
import {
 SHARED_PRIVATE_SOURCE_READ_SCHEMA,buildPrivateSourceSharedReadManifest,
 assertPrivateSourceSharedReadManifest
} from "./private-osint-shared-read-contract.mjs";
import {sealPrivateOsintSpool,unsealPrivateOsintSpool} from "./private-osint-encrypted-spool.mjs";

const now=Date.parse("2026-10-27T19:33:00.000Z");
const root="dummy-NOT-REAL-test-token-"+randomBytes(48).toString("hex");
function record(category,title,country="IND"){
 const normalized=normalizeReusableNewsJson({
  category,text:title,
  published_at:new Date(now-60000).toISOString(),license:"unknown",
  country_iso3:country,
 });
 return {...normalized,id:"news-"+randomBytes(32).toString("hex")};
}
const a=record("macro","India inflation outlook and central bank monetary policy statement");
const b=record("rare_earth","India lithium cobalt critical minerals government supply update");
const c=record("geopolitics","India government security sanctions ceasefire policy statement");

test("one immutable shared source set permits 3 categories without new raw fetch or D1 SELECT",()=>{
 const set=[a,b,c];
 const manifest=buildPrivateSourceSharedReadManifest(set,now);
 assert.equal(manifest.schema,SHARED_PRIVATE_SOURCE_READ_SCHEMA);
 assert.equal(manifest.item_count,3);
 assert.equal(manifest.counts_by_category.macro,1);
 assert.equal(manifest.counts_by_category.rare_earth,1);
 assert.equal(manifest.counts_by_category.geopolitics,1);
 assert.equal(manifest.raw_publisher_stored,false);
 assert.equal(manifest.independently_verified,false);
 assert.equal(manifest.commercial_rights_verified,false);
 assert.match(manifest.content_sha256,/^[0-9a-f]{64}$/u);
 assert.deepEqual(buildPrivateSourceSharedReadManifest([...set].reverse(),now),manifest);
 assert.deepEqual(assertPrivateSourceSharedReadManifest(set,manifest,now),manifest);
 const serialized=JSON.stringify(manifest);
 for(const secret of ["India","government","http","article","central bank","lithium"])
  assert.ok(!serialized.includes(secret));
});
test("different bytes with SAME news ID are rejected; no silent stale or rights upgrade",()=>{
 const baseline=buildPrivateSourceSharedReadManifest([a,b],now);
 assert.throws(()=>assertPrivateSourceSharedReadManifest([a,c],baseline,now),
  /PRIVATE_SOURCE_SHARED_MANIFEST_MISMATCH/);
 assert.throws(()=>buildPrivateSourceSharedReadManifest([a,a],now),
  /PRIVATE_SOURCE_SHARED_DUPLICATE/);
 assert.throws(()=>buildPrivateSourceSharedReadManifest([{
  ...a,facts:{...a.facts,action_terms:["forged"]}
 },a],now),/PRIVATE_SOURCE_SHARED_ID_COLLISION/);
 assert.throws(()=>buildPrivateSourceSharedReadManifest([{
  ...a,source:{...a.source,original_url:"https://private-source.example/article"}
 }],now));
 assert.throws(()=>buildPrivateSourceSharedReadManifest([{
  ...a,usage_rights:{...a.usage_rights,commercial_reuse_authorized:true}
 }],now));
 assert.throws(()=>buildPrivateSourceSharedReadManifest([a],now+26*3600000));
 assert.throws(()=>assertPrivateSourceSharedReadManifest([a],{
  ...buildPrivateSourceSharedReadManifest([a],now),canonical_d1_durable:true
 },now),/PRIVATE_SOURCE_SHARED_MANIFEST_UNSAFE/);
});
test("GitHub AES-GCM ciphertext contains authenticated exact read manifest; no publisher bytes disclosed",()=>{
 const rows=[a,b,c];
 const encrypted=sealPrivateOsintSpool({items:rows,root,now});
 const text=JSON.stringify(encrypted);
 assert.ok(!text.includes("shared_source_read"));
 assert.ok(!text.includes("India"));
 const decoded=unsealPrivateOsintSpool(encrypted,root,now+60000);
 const agreed=buildPrivateSourceSharedReadManifest(rows,now);
 assert.equal(decoded.original_shared_source_read.content_sha256,agreed.content_sha256);
 assert.equal(decoded.shared_source_read.content_sha256,agreed.content_sha256);
 assert.equal(decoded.verified_d1,false);
 assert.equal(decoded.expired,0);
});
test("older encrypted pre-manifest GitHub artifacts remain readable without extending source clock",()=>{
 const created_at=new Date(now).toISOString();
 const legacy={schema:"geomacro.private-osint-spool-payload.v1",
  created_at,items:[a,b]};
 const zipped=gzipSync(Buffer.from(JSON.stringify(legacy)));
 const nonce=randomBytes(12);
 const key=createHmac("sha256",root)
  .update("geomacro.osint-held-spool.aes256gcm.v1").digest();
 const cipher=createCipheriv("aes-256-gcm",key,nonce);
 cipher.setAAD(Buffer.from("geomacro.osint-held-spool.aes256gcm.v1|"+created_at));
 const encrypted=Buffer.concat([cipher.update(zipped),cipher.final()]);
 const oldEnvelope={
  schema:"geomacro.encrypted-private-osint-held-spool.v1",
  created_at,algorithm:"aes-256-gcm+gzip",
  nonce:nonce.toString("base64"),ciphertext:encrypted.toString("base64"),
  tag:cipher.getAuthTag().toString("base64"),
  unverified_observation_count:2,
  canonical_d1_write_verified:false,rights_authorized:false,
 };
 const recovered=unsealPrivateOsintSpool(oldEnvelope,root,now+120000);
 assert.equal(recovered.items.length,2);
 assert.equal(recovered.verified_d1,false);
 assert.equal(recovered.original_shared_source_read.content_sha256,
  buildPrivateSourceSharedReadManifest([a,b],now).content_sha256);
});
