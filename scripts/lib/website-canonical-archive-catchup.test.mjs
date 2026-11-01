import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {reconcileCanonicalWebsiteArchiveCandidates} from "./website-canonical-archive-catchup.mjs";
const now=Date.parse("2026-11-02T00:00:00.000Z");
const row=(category,id,status="osint_feed_observed_unverified")=>({
 category,id:category+"-"+id,
 title:"Geomacro finds the ministry announced a dated change",
 published_at:"2026-11-01T22:00:00.000Z",
 status
});
const eligible=x=>x.status!=="official_feed_candidate_unscored";
const concrete=x=>x.title.includes("announced");
test("cross-publisher canonical D1 records reach immutable archive candidate set",()=>{
 const source=[row("geopolitics","00000001")];
 const canonical=[
  {...source[0],title:"Geomacro finds the ministry announced the canonical original"},
  row("macro","00000002"),row("rare_earth","00000003"),
  row("geopolitics","00000004","official_feed_candidate_unscored")
 ];
 const out=reconcileCanonicalWebsiteArchiveCandidates({
  sourceCandidates:source,canonicalRows:canonical,now,
  isArchiveEligible:eligible,isConcrete:concrete
 });
 assert.deepEqual(out.candidates.map(x=>x.id),[
  "geopolitics-00000001","macro-00000002","rare_earth-00000003"
 ]);
 assert.equal(out.candidates[0].title,canonical[0].title);
 assert.deepEqual(out.new_canonical_ids_added,{geopolitics:0,macro:1,rare_earth:1});
 assert.deepEqual(out.canonical_qualified,{geopolitics:1,macro:1,rare_earth:1});
 assert.equal(out.skipped_not_display_eligible,1);
 assert.equal(out.extra_d1_reads,0);
 assert.equal(out.predge_modified,false);
 assert.equal(out.native_original_dates_modified,false);
 assert.equal(out.payments,0);
});
test("D1 ID collisions and unbounded candidate artifacts fail closed",()=>{
 const s=row("macro","00000001");
 const opts={sourceCandidates:[],canonicalRows:[s,s],
  now,isArchiveEligible:eligible,isConcrete:concrete};
 assert.throws(()=>reconcileCanonicalWebsiteArchiveCandidates(opts),
  /WEBSITE_CANONICAL_STATIC_D1_ID_INVALID/);
 assert.throws(()=>reconcileCanonicalWebsiteArchiveCandidates({
  ...opts,canonicalRows:Array.from({length:601},(_,i)=>row("macro",String(i).padStart(8,"0")))
 }),/WEBSITE_CANONICAL_STATIC_CATCHUP_ARGUMENTS_INVALID/);
});
test("hourly workflow performs canonical recovery before candidate export, reusing one readback",()=>{
 const script=readFileSync("scripts/ops/publish-website-derived-news.ts","utf8");
 const reconciliation=script.indexOf("const staged=reconcileCanonicalWebsiteArchiveCandidates(");
 const exportArtifact=script.indexOf("writeFileSync(\"artifacts/derived-news/permanent-archive-candidates.json\"");
 assert.ok(reconciliation>0&&exportArtifact>reconciliation);
 assert.match(script,/afterPublicationRows=retained;/);
 assert.match(script,/if\(afterPublicationRows!==null\)retained=afterPublicationRows;/);
 assert.match(script,/if\(!ARCHIVE_ONLY&&workerPolicyReady\)/);
 assert.match(script,/canonicalArchiveReadAttempted=true/);
 assert.match(script,/WEBSITE_CANONICAL_D1_STATIC_CATCHUP_UNVERIFIED/);
 const workflow=readFileSync(".github/workflows/website-derived-news-continuity.yml","utf8");
 assert.match(workflow,/bun scripts\/ops\/publish-website-derived-news.ts/);
 assert.match(workflow,/scripts\/ops\/publish-permanent-derived-news-archive.mjs/);
 assert.match(workflow,/cron: "7 \* \* \* \*"/);
});
