import test from "node:test";
import assert from "node:assert/strict";
import {GDELT_PUBLIC_BATCH_MANIFEST,parseGdeltBatchManifest}
  from "../lib/gdelt-free-batch-manifest.mjs";
import {PRODUCTION_FREE_UPDATE_SOURCES,summarizeFreeSourceUpdates}
  from "../lib/free-source-production-updates.mjs";
import {validateFreeLineupProbePayload} from "../lib/free-no-key-source-probe.mjs";
const now=new Date("2026-10-24T00:05:00Z");
const batch="20261024000000";
const kinds=["export.CSV","mentions.CSV","gkg.csv"];
function manifest(stamp=batch){
 return kinds.map((kind,index)=>
   (80000+index*12000)+" "+"a".repeat(32)+" "+
   "http://data.gdeltproject.org/gdeltv2/"+stamp+"."+kind+".zip").join("\n")+"\n";
}
test("free Telegram-independent exact first-party batch index, licensed dataset only",()=>{
 const spec=PRODUCTION_FREE_UPDATE_SOURCES.find(x=>x.id==="gdelt_events");
 assert.ok(spec);
 assert.equal(spec.url,GDELT_PUBLIC_BATCH_MANIFEST);
 assert.equal(new URL(spec.url).hostname,"data.gdeltproject.org");
 assert.equal(spec.format,"manifest");
 assert.equal(spec.maxBytes,4096);
 assert.equal(spec.poll_minutes,30);
 assert.equal(spec.category,"geopolitics");
 assert.equal(PRODUCTION_FREE_UPDATE_SOURCES.filter(x=>x.id==="gdelt_events").length,1);
 const proof=parseGdeltBatchManifest(manifest(),{now});
 assert.equal(proof.current_batch_within_90m,true);
 assert.equal(proof.upstream_batch_at,"2026-10-24T00:00:00Z");
 assert.equal(proof.clock_semantics,"DATASET_BATCH_NOT_ORIGINAL_EVENT_TIME");
 for(const key of ["individual_news_event_verified","original_article_published_at_verified",
 "country_195x3_certified","signed_commercial_data_verified","chargeable",
 "source_rights_inherited_from_linked_news"]){
   assert.equal(proof[key],false);
 }
 assert.ok(validateFreeLineupProbePayload(spec,manifest()).valid);
 const result=summarizeFreeSourceUpdates(spec,manifest(),now);
 assert.equal(result.kind,"GDELT_FREE_DATASET_BATCH_DISCOVERY_ONLY");
 assert.equal(result.sampled_records,1);
 assert.equal(result.latest_native_publication_at,null);
 assert.equal(result.native_publications_within_30m,0);
 assert.equal(result.independently_verified_event,false);
 assert.equal(result.topic_relevance_classified,false);
 // Check the complete serialized receipt shape instead of URL-substring filtering.
 assert.deepEqual(Object.keys(result).sort(),[
   "kind","sampled_records","fingerprints","latest_native_publication_at",
   "native_publications_within_30m","native_publications_within_6h",
   "corridor_advisory_candidate_count","candidate_corridor_ids",
   "corridor_current_disruption_verified","independently_verified_event",
   "topic_relevance_classified",
 ].sort());
 assert.ok(result.fingerprints.every(x=>/^[a-f0-9]{64}$/u.test(x)));
 assert.ok(!JSON.stringify(result).includes("a".repeat(32)));
});
test("stale and ahead-of-clock manifests never prove fresh original publisher events",()=>{
 const stale=parseGdeltBatchManifest(manifest("20261023000000"),{now});
 assert.ok(stale);
 assert.equal(stale.current_batch_within_90m,false);
 const future=parseGdeltBatchManifest(manifest("20261024003000"),{now});
 assert.ok(future);
 assert.equal(future.current_batch_within_90m,false);
 for(const row of [stale,future]){
 assert.equal(row.original_article_published_at_verified,false);
 assert.equal(row.individual_news_event_verified,false);
 }
});
test("exact 3 pinned batches, strict 15-minute calendar and byte-size, no URLs followed",()=>{
 const raw=manifest();
 for(const bad of [
   raw.replace("http://data.gdeltproject.org","https://evil.gdeltproject.org"),
   raw.replace("http://data.gdeltproject.org","http://data.gdeltproject.org.evil"),
   raw.replace("20261024000000","20261024000500"),
   raw.replace("20261024000000","20261024240000"),
   raw.replace("export.CSV.zip","news.CSV.zip"),
   raw.replace("mentions.CSV.zip","export.CSV.zip"),
   raw.replace("a".repeat(32),"not-md5"),
   raw.replace(/^80000/u,"1"),
   raw+"1000 "+ "b".repeat(32)+" http://evil.test/file.zip",
   " ",
   "X".repeat(8000),
 ]){
   assert.equal(parseGdeltBatchManifest(bad,{now}),null);
 }
});
test("GDELT batch producer has no Telegram imports, paid credentials, ZIP fetch, or phantom event certification",async()=>{
 const {readFileSync}=await import("node:fs");
 const source=readFileSync("scripts/lib/free-source-production-updates.mjs","utf8");
 const manifestSource=readFileSync("scripts/lib/gdelt-free-batch-manifest.mjs","utf8");
 const workflow=readFileSync(".github/workflows/free-commercial-source-lineup.yml","utf8");
 assert.ok(!/telegram\.org|t\.me\//iu.test(source+manifestSource));
 assert.ok(!/await fetch|fetchImpl\(/iu.test(manifestSource));
 assert.ok(workflow.includes('cron: "17,47 * * * *"'));
 assert.ok(workflow.includes("--production-updates"));
 assert.ok(workflow.includes("CLOUDFLARE_API_TOKEN"));
});
