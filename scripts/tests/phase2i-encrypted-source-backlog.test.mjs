import test from "node:test";
import assert from "node:assert/strict";
import {mergePrivatePhase2iSourceBacklog,sealPrivatePhase2iSourceBacklog,
 unsealPrivatePhase2iSourceBacklog,selectPrivatePhase2iBacklogArtifact,
 PHASE2I_BACKLOG_ARTIFACT} from "../lib/phase2i-encrypted-source-backlog.mjs";
const NOW=Date.parse("2026-11-02T12:00:00.000Z");
const ROOT="protected-private-phase2i-test-root-not-real-secret";
const item=(n,category="macro",pub="2026-11-02T10:00:00.000Z")=>({
 category,title:"Central bank published monetary policy "+n,
 articleUrl:"https://centralbank.example.org/news/"+n,
 publishedAt:pub,sourceId:"centralbank.example.org",
 sourceUrl:"https://centralbank.example.org/rss",
 credit:null,issuerContextCountryIso3:null,
});
test("encrypted complete queue roundtrips, retaining original native time and all three categories",()=>{
 const items=[item(1),item(2,"geopolitics"),item(3,"rare_earth")];
 const result=mergePrivatePhase2iSourceBacklog([],items,NOW);
 assert.equal(result.available,3);
 const sealed=sealPrivatePhase2iSourceBacklog({candidates:result.candidates,root:ROOT,now:NOW});
 assert.equal(sealed.canonical_d1_verified,false);
 assert.equal(sealed.commercial_reuse_verified,false);
 assert.equal(JSON.stringify(sealed).includes(items[0].title),false);
 assert.equal(JSON.stringify(sealed).includes(items[0].articleUrl),false);
 const read=unsealPrivatePhase2iSourceBacklog(sealed,ROOT,NOW+15*60_000);
 assert.equal(read.restored_authentic_originals,3);
 assert.deepEqual(new Set(read.candidates.map(x=>x.category)),
  new Set(["geopolitics","macro","rare_earth"]));
 assert.ok(read.candidates.some(x=>x.publishedAt===items[0].publishedAt));
});
test("authenticated D1 acknowledgements survive AEAD queue handoff and fresh re-observations",()=>{
 const acknowledged={...item(77),d1Acknowledged:true};
 const saved=mergePrivatePhase2iSourceBacklog([acknowledged],[item(77)],NOW);
 assert.equal(saved.available,1);
 assert.equal(saved.candidates[0].d1Acknowledged,true);
 const sealed=sealPrivatePhase2iSourceBacklog({candidates:saved.candidates,root:ROOT,now:NOW});
 assert.equal(JSON.stringify(sealed).includes("d1Acknowledged"),false);
 const replay=unsealPrivatePhase2iSourceBacklog(sealed,ROOT,NOW+15*60_000);
 assert.equal(replay.candidates[0].d1Acknowledged,true);
 const different={...item(78),d1Acknowledged:false};
 const renewed=mergePrivatePhase2iSourceBacklog(replay.candidates,[different],NOW+15*60_000);
 assert.equal(renewed.candidates.find(c=>c.articleUrl===different.articleUrl).d1Acknowledged,false);
 assert.equal(mergePrivatePhase2iSourceBacklog([], [{...item(79),d1Acknowledged:"true"}],NOW).available,0);
});
test("re-observed unchanged original is deduplicated; conflicting original title quarantined",()=>{
 const original=item(4);
 const same=mergePrivatePhase2iSourceBacklog([original],[original],NOW);
 assert.equal(same.available,1);
 assert.equal(same.duplicate_suppressed,1);
 const corrupt=mergePrivatePhase2iSourceBacklog([original],
  [{...original,title:"Different immutable original headline"}],NOW);
 assert.equal(corrupt.available,0);
 assert.equal(corrupt.immutable_conflicts_quarantined,1);
 const other=mergePrivatePhase2iSourceBacklog([original],
  [{...original,sourceUrl:"https://other.example.org/feed",issuerContextCountryIso3:"IND"}],NOW);
 assert.equal(other.candidates[0].sourceUrl,null);
 assert.equal(other.candidates[0].issuerContextCountryIso3,null);
});
test("publisher clock expires after 72h; ingestion/reseal cannot refresh original date",()=>{
 const valid=item(9,"macro",new Date(NOW-71*3600_000).toISOString());
 const old=item(10,"macro",new Date(NOW-73*3600_000).toISOString());
 const s=sealPrivatePhase2iSourceBacklog({candidates:[valid,old],root:ROOT,now:NOW});
 assert.equal(s.unverified_candidates,1);
 const data=unsealPrivatePhase2iSourceBacklog(s,ROOT,NOW+2*3600_000);
 assert.equal(data.candidates.length,0);
 assert.equal(data.expired_since_capture,1);
 assert.equal(data.canonical_d1_proven,false);
 assert.throws(()=>unsealPrivatePhase2iSourceBacklog(s,ROOT,NOW+73*3600_000),
  /PHASE2I_BACKLOG_ENVELOPE_INVALID/);
});
test("tampering, wrong key and externally supplied queue metadata never become accepted originals",()=>{
 const s=sealPrivatePhase2iSourceBacklog({candidates:[item(5)],root:ROOT,now:NOW});
 assert.throws(()=>unsealPrivatePhase2iSourceBacklog(
  {...s,ciphertext:s.ciphertext.slice(0,-4)+"AAAA"},ROOT,NOW),
  /PHASE2I_BACKLOG_AUTHENTICATION_FAILED/);
 assert.throws(()=>unsealPrivatePhase2iSourceBacklog(s,"wrong-secret",NOW));
 assert.equal(mergePrivatePhase2iSourceBacklog([],
  [{...item(5),articleUrl:"http://localhost/private"}],NOW).available,0);
 assert.equal(mergePrivatePhase2iSourceBacklog([],
  [{...item(5),publishedAt:new Date(NOW+5*60_000).toISOString()}],NOW).available,0);
});
test("choose only the most recent nonexpired main-branch, named Actions ciphertext",()=>{
 const a={id:8,name:PHASE2I_BACKLOG_ARTIFACT,expired:false,
  created_at:new Date(NOW-30*60_000).toISOString(),
  workflow_run:{id:44,head_branch:"main"}};
 const b={...a,id:9,created_at:new Date(NOW-10*60_000).toISOString(),
  workflow_run:{id:45,head_branch:"feature"}};
 const c={...a,id:10,created_at:new Date(NOW-73*3600_000).toISOString()};
 assert.equal(selectPrivatePhase2iBacklogArtifact([c,b,a],NOW)?.id,8);
 assert.equal(selectPrivatePhase2iBacklogArtifact([c,b],NOW),null);
});
