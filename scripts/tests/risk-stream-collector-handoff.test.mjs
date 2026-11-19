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
  assert.match(workflow,/GEOMACRO_RISK_STREAM_RADAR_FILE/u);
  assert.ok(workflow.includes('--radar-file "$GEOMACRO_RISK_STREAM_RADAR_FILE"'));
  assert.match(workflow,/GEOMACRO_EXPECTED_CONTROL_PLANE_SOURCE_SHA: \$\{\{ vars\.GEOMACRO_STEP3_REVIEWED_SHA \|\| github\.sha \}\}/u);
 }
 const sourceOnly=read("scripts/ops/phase2i-source-only-raw-tick.ts");
 assert.match(sourceOnly,/redactedRightsRadar/u);
 assert.match(sourceOnly,/raw_source_text_written:false/u);
 assert.match(sourceOnly,/licensed_source_text_included:false/u);
 const radar=read("scripts/lib/rights-redacted-speed-radar.mjs");
 assert.match(radar,/commercial_rights_approved:0/u);
 assert.match(radar,/signed_gro_authorized:false/u);
 assert.match(radar,/prioritizeApprovedAnchorSources/u);
 const collector=read("scripts/ops/collect-risk-stream-feed-extensions.mjs");
 assert.match(collector,/prioritizeApprovedAnchorSources/u);
 assert.match(collector,/const approved=new Map\\(manifest\\.entries\\.filter\\(row=>row\\.status==="APPROVED"/u);
 const sidecar=read("scripts/ops/emit-risk-stream-collector-sidecar.mjs");
 assert.match(sidecar,/NO_ITEM_LICENSE_VERIFIED_CANDIDATES/u);
 assert.match(sidecar,/emitRiskStreamCandidates/u);
 const emitter=read("scripts/ops/emit-risk-stream-candidates.mjs");
 assert.match(emitter,/prepareRiskStreamCandidate/u);
 assert.match(emitter,/risk-stream\/runtime/u);
 assert.match(emitter,/CONTROL_PLANE_RUNTIME_NOT_READY/u);
 assert.match(emitter,/risk-stream\/attest/u);
 assert.match(emitter,/risk-stream\/events/u);
 assert.match(emitter,/risk-stream\/readback/u);
 assert.match(emitter,/d1_readback_verified:true/u);
 const workflow=read(".github/workflows/private-global-osint-15m.yml");
 assert.match(workflow,/node scripts\/ops\/verify-risk-stream-queue-provider\.mjs/u);
 assert.match(workflow,/RISK_STREAM_QUEUE_PROVIDER_RECEIPT_SHA256/u);
 const provider=read("scripts/ops/verify-risk-stream-queue-provider.mjs");
 assert.match(provider,/result_info\?\.total_pages/u);
 assert.match(provider,/PRODUCER_BINDING_UNVERIFIED/u);
 assert.match(provider,/CONSUMER_BINDING_UNVERIFIED/u);
 assert.match(workflow,/readback='\+Date\.now\(\)/u);
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
