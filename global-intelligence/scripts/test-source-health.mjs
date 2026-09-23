import assert from "node:assert/strict";
import { evaluateFreshness, aggregateSourceHealth } from "../health/source-health.mjs";

const fresh=evaluateFreshness("2026-09-22T00:00:00Z",{now:new Date("2026-09-23T00:00:00Z"),maxAgeDays:30});
const stale=evaluateFreshness("2026-07-01T00:00:00Z",{now:new Date("2026-09-23T00:00:00Z"),maxAgeDays:30});
assert.equal(fresh.status,"FRESH");
assert.equal(stale.status,"STALE");

const aggregate=aggregateSourceHealth([
  {source_id:"b",category:"MACRO",status:"FAIL",checked_at:"2026-09-23T00:00:01Z",latency_ms:2},
  {source_id:"a",category:"MACRO",status:"PASS",checked_at:"2026-09-23T00:00:01Z",latency_ms:1},
  {source_id:"a",category:"MACRO",status:"FAIL",checked_at:"2026-09-22T00:00:01Z",latency_ms:4}
]);
assert.equal(aggregate.source_count,2);
assert.equal(aggregate.counts.PASS,1);
assert.equal(aggregate.counts.FAIL,1);
assert.deepEqual(aggregate.results.map(x=>x.source_id),["a","b"]);
console.log(JSON.stringify({status:"PASS",fresh,stale,counts:aggregate.counts},null,2));
