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
  assert.match(workflow,/RISK_STREAM_ACTIVE == '1'/u);
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
 assert.match(worker,/geomacro_risk_stream_candidate/u);
 assert.match(worker,/risk_stream_item_licensed/u);
 assert.match(worker,/risk-stream\/attest/u);
 assert.match(worker,/risk-stream\/events/u);
 assert.match(worker,/candidate\.get\("schema"\) != "geomacro\.risk-stream-candidate\.v1"/u);
 assert.match(worker,/self\.pending\.setdefault\(event\["id"\], event\)/u);
});
