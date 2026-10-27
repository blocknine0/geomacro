import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {normalizeReusableNewsJson} from "../../src/lib/reusable-news-json.ts";
import {sealPrivateOsintSpool,unsealPrivateOsintSpool,
 selectPrivateOsintSpoolArtifacts,OSINT_SPOOL_ARTIFACT_NAME,
 OSINT_SPOOL_ENVELOPE} from "./private-osint-encrypted-spool.mjs";

const now=Date.parse("2026-10-27T17:45:00.000Z");
const secret="production-only-example-secret-NEVER-COMMIT-NOT-REAL";
function row(category,stamp,subject){
 const doc=normalizeReusableNewsJson({
  category,text:subject,published_at:stamp,country_iso3:"IND",
  license:"unknown",
 });
 return {...doc,id:"news-"+randomBytes(32).toString("hex")};
}
const a=row("macro","2026-10-27T17:40:00.000Z",
 "Federal Reserve announces India inflation and monetary policy changes");
const b=row("rare_earth","2026-10-27T17:35:00.000Z",
 "India lithium and cobalt mineral supply chain export restrictions");
const c=row("geopolitics","2026-10-27T17:30:00.000Z",
 "India government announces ceasefire conflict and sanctions changes");
test("authenticated only ciphertext artifact contains no original text, URLs or rights upgrades",()=>{
 const sealed=sealPrivateOsintSpool({items:[a,b,c],root:secret,now});
 assert.equal(sealed.schema,OSINT_SPOOL_ENVELOPE);
 assert.equal(sealed.unverified_observation_count,3);
 assert.equal(sealed.canonical_d1_write_verified,false);
 assert.equal(sealed.rights_authorized,false);
 const bytes=JSON.stringify(sealed);
 for(const raw of ["Federal Reserve","India lithium","government announces",
  "country_iso3","https://","critical minerals"])
  assert.equal(bytes.includes(raw),false);
 const decoded=unsealPrivateOsintSpool(sealed,secret,now+60000);
 assert.equal(decoded.items.length,3);
 assert.equal(decoded.expired,0);
 assert.deepEqual(new Set(decoded.items.map(x=>x.category)),
  new Set(["macro","rare_earth","geopolitics"]));
 assert.equal(decoded.verified_d1,false);
 assert.ok(decoded.items.every(x=>x.verification.original_page_verified===false&&
  x.usage_rights.commercial_reuse_authorized===false));
});
test("AES GCM authentication rejects changed ciphertext, wrong root, wrong tag and timestamp",()=>{
 const sealed=sealPrivateOsintSpool({items:[a],root:secret,now});
 const tampered={...sealed,ciphertext:
  (sealed.ciphertext[0]==="A"?"B":"A")+sealed.ciphertext.slice(1)};
 assert.throws(()=>unsealPrivateOsintSpool(tampered,secret,now),/AUTHENTICATION_FAILED/);
 assert.throws(()=>unsealPrivateOsintSpool(sealed,secret+"other",now),/AUTHENTICATION_FAILED/);
 assert.throws(()=>unsealPrivateOsintSpool({...sealed,tag:"A".repeat(22)+"=="},secret,now),
  /AUTHENTICATION_FAILED/);
 assert.throws(()=>unsealPrivateOsintSpool({...sealed,created_at:
  "2026-10-27T17:44:00.000Z"},secret,now),/AUTHENTICATION_FAILED/);
});
test("old source publication fails closed even if artifact itself is still fresh",()=>{
 const old=row("macro","2026-10-26T16:50:00.000Z",
  "India inflation report from earlier reporting period");
 const sealed=sealPrivateOsintSpool({items:[a,old],root:secret,now});
 const late=unsealPrivateOsintSpool(sealed,secret,now+10*60000);
 assert.equal(late.original_count,2);
 assert.equal(late.items.length,1);
 assert.equal(late.expired,1);
 assert.throws(()=>unsealPrivateOsintSpool(sealed,secret,now+26*3600000),
  /OSINT_SPOOL_EXPIRED/);
});
test("deceptive rights, raw original URLs and duplicate item ids cannot enter sealed artifact",()=>{
 assert.throws(()=>sealPrivateOsintSpool({items:[{...a,delivery:{
  ...a.delivery,downstream_paid_product_authorized:true}}],root:secret,now}),
  /REUSABLE|INVALID|UNSAFE|NOT_ALLOWED/iu);
 assert.throws(()=>sealPrivateOsintSpool({items:[{...a,source:{
  ...a.source,original_url:"https://private-news.example/post"}}],root:secret,now}));
 assert.throws(()=>sealPrivateOsintSpool({items:[a,a],root:secret,now}),/DUPLICATE_NEWS_ID/);
 assert.equal(sealPrivateOsintSpool({items:[],root:secret,now}),null);
});
test("GitHub artifact selection accepts protected main and at most 2 valid fresh envelopes",()=>{
 const a1={name:OSINT_SPOOL_ARTIFACT_NAME,id:8,expired:false,
  created_at:"2026-10-27T17:00:00.000Z",workflow_run:{head_branch:"main"}};
 const a2={...a1,id:9,created_at:"2026-10-27T17:15:00.000Z"};
 const bad={...a1,id:10,workflow_run:{head_branch:"feature"}};
 const expired={...a1,id:11,expired:true};
 const stale={...a1,id:12,created_at:"2026-10-26T15:00:00.000Z"};
 const wrong={...a1,id:13,name:"other-artifact"};
 assert.deepEqual(selectPrivateOsintSpoolArtifacts(
  [a2,bad,expired,stale,wrong,a1],now,2).map(x=>x.id),[8,9]);
 assert.deepEqual(selectPrivateOsintSpoolArtifacts([],now,1),[]);
 assert.throws(()=>selectPrivateOsintSpoolArtifacts(Array(101).fill(a1),now));
});
