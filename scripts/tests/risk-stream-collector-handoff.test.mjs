import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(path,"utf8");

test("scheduled direct and private collectors hand only complete licensed sidecars to the shared emitter",()=>{
 for(const path of [
  ".github/workflows/hot50-direct-original-news-20m.yml",
  ".github/workflows/private-global-osint-15m.yml",
 ]){
  const workflow=read(path);
  assert.match(workflow,/emit-risk-stream-collector-sidecar\.mjs/u);
  assert.match(workflow,/risk_stream_sidecar_admitted == 'true'/u);
  assert.doesNotMatch(workflow,/vars\.RISK_STREAM_ACTIVE == '1'.{0,180}emit-risk-stream-collector-sidecar/u);
  assert.match(workflow,/RISK_STREAM_MACHINE_FACTS_SPKI_B64/u);
  assert.match(workflow,/RISK_STREAM_MACHINE_RIGHTS_SPKI_B64/u);
 }
 const sidecar=read("scripts/ops/emit-risk-stream-collector-sidecar.mjs");
 assert.match(sidecar,/NO_ITEM_LICENSE_VERIFIED_CANDIDATES/u);
 assert.match(sidecar,/emitRiskStreamCandidates/u);
 const emitter=read("scripts/ops/emit-risk-stream-candidates.mjs");
 assert.match(emitter,/prepareRiskStreamCandidate/u);
 assert.match(emitter,/risk-stream\/attest/u);
 assert.match(emitter,/risk-stream\/events/u);
});

test("Render collector does not promote ordinary article metadata and invokes both internal attest and event endpoints only for opt-in originals",()=>{
 const worker=read("workers/unified-ingestor/ingestor.py");
 assert.match(worker,/risk_stream_item_licensed/u);
 assert.match(worker,/risk-stream\/attest/u);
 assert.match(worker,/risk-stream\/events/u);
 assert.match(worker,/candidate_from_standard_entry/u);
 assert.match(worker,/risk_stream_standard_item_license_candidate is True/u);
 assert.match(worker,/rel=\[\\"'\]license/u);
 assert.match(worker,/self\.pending\.setdefault\(event\["id"\], event\)/u);
 const feeds=JSON.parse(read("config/unified-rss-feed-registry.v1.json"));
 const rights=JSON.parse(read("config/risk-stream-source-rights-reviewed.v1.json"));
 const approved=new Set(rights.entries.filter(entry=>entry.status==="APPROVED").map(entry=>entry.source_id));
 const opted=feeds.sources.filter(feed=>feed.risk_stream_item_licensed===true);
 assert.ok(opted.length>0);
 assert.ok(opted.every(feed=>feed.risk_stream_standard_item_license_candidate===true&&approved.has(feed.name)));
});
