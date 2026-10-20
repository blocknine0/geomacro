import test from "node:test";
import assert from "node:assert/strict";
import {normalizeCochilcoObservation} from "../../global-intelligence/adapters/cochilco-minerals.mjs";
const opts={series:"Mine copper production",period:"2026-08",value:366.3,unit:"kt",
  commodity:"Copper",retrievedAt:"2026-10-20T07:35:00.000Z"};
test("COCHILCO reference month never becomes forged first-day publisher timestamp",()=>{
 const result=normalizeCochilcoObservation(opts);
 assert.equal(result.country_iso3,"CHL");
 assert.equal(result.observation_period,"2026-08");
 assert.equal(result.clock_semantics,"reference_month");
 assert.equal(result.published_at,null);
 assert.equal(result.native_publication_time_verified,false);
 assert.equal(result.observed_at,"2026-10-20T07:35:00.000Z");
 assert.equal(result.value_numeric,366.3);
 assert.doesNotMatch(JSON.stringify(result),/2026-08-01T00:00:00/);
});
test("invalid month, day-shaped or unlabeled reference period cannot be normalized",()=>{
 for(const period of ["2026-00","2026-13","2026-08-01","13.Oct.2026",
  "2026-7","not known","2026-08T00:00:00Z"]){
  assert.throws(()=>normalizeCochilcoObservation({...opts,period}),/Invalid COCHILCO observation/);
 }
});
test("reference period is stable irrespective of processing time; hash remains deterministic",()=>{
 const a=normalizeCochilcoObservation(opts);
 const b=normalizeCochilcoObservation({...opts,retrievedAt:"2026-10-21T08:00:00.000Z"});
 assert.equal(a.source_record_id,b.source_record_id);
 assert.equal(a.raw_hash,b.raw_hash);
 assert.equal(a.published_at,b.published_at);
 assert.notEqual(a.observed_at,b.observed_at);
});
