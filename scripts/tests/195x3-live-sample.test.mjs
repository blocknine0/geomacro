#!/usr/bin/env node
import assert from "node:assert/strict";
import { select195x3LiveSample } from "../lib/195x3-live-sample.mjs";

const candidates = Array.from({ length: 1170 }, (_, index) => ({ id: `G195-${String(index + 1).padStart(5, "0")}` }));
const first = select195x3LiveSample(candidates, 12, 0);
assert.equal(first.length, 12);
assert.equal(new Set(first.map(candidate => candidate.id)).size, 12);
assert.deepEqual(select195x3LiveSample(candidates, 12, 0), first);
assert.notDeepEqual(select195x3LiveSample(candidates, 12, 1), first);

const allRotated = new Set();
for (let day = 0; day < Math.ceil(candidates.length / 12); day++) {
  const sample = select195x3LiveSample(candidates, 12, day);
  assert.equal(sample.length, 12);
  assert.equal(new Set(sample.map(candidate => candidate.id)).size, 12);
  for (const candidate of sample) allRotated.add(candidate.id);
}
assert.equal(allRotated.size, candidates.length, "98 daily windows must cover every live candidate");

assert.throws(() => select195x3LiveSample(candidates, 0, 0), /LIVE_SAMPLE_LIMIT_INVALID/u);
assert.throws(() => select195x3LiveSample([{ id: "duplicate" }, { id: "duplicate" }], 1, 0), /LIVE_CANDIDATE_IDS_MUST_BE_UNIQUE/u);
console.log("195x3 live rotation PASS: exactly 12 unique probes per day; all 1,170 candidates covered in 98 daily windows.");
