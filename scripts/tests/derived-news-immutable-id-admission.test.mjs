import {test} from "node:test";
import assert from "node:assert/strict";
import {partitionCanonicalDerivedCandidates as partition}
 from "../lib/derived-news-immutable-id-admission.mjs";
const make=(id="macro-1234abcd",date="2026-10-30T12:00:00.000Z")=>({
 id,category:"macro",published_at:date,date_precision:"exact",
 title:"Geomacro finds Federal Reserve issued a monetary statement",
 what_changed:"Federal Reserve issued a statement about rate-setting.",
});
test("canonical immutable native clock is preserved and a conflicting candidate is not ACK-eligible",()=>{
 const old=make(), next={...old,published_at:"2026-11-01T12:00:00.000Z"};
 const r=partition([old],[next]);
 assert.deepEqual(r.admit,[]);
 assert.deepEqual(r.archive,[old]);
 assert.equal(r.immutable_conflicts_deferred,1);
 assert.equal(r.canonical_unchanged,0);
 assert.equal(r.source_ids_logged,false);
});
test("unchanged IDs save quota; editorial revisions with identical native date are eligible",()=>{
 const old=make(),updated={...old,what_changed:"A new verified wording on the same original publisher date."};
 const r=partition([old],[old,make("macro-87654321"),updated].slice(0,2));
 assert.equal(r.canonical_unchanged,1);
 assert.equal(r.admit.length,1);
 assert.equal(r.admit[0].id,"macro-87654321");
 const revision=partition([old],[updated]);
 assert.deepEqual(revision.admit,[updated]);
 assert.equal(revision.immutable_conflicts_deferred,0);
});
test("category/precision collisions defer instead of changing original clock",()=>{
 const old=make();
 for(const change of [{category:"geopolitics"},{date_precision:"day"}]){
  const r=partition([old],[{...old,...change}]);
  assert.equal(r.immutable_conflicts_deferred,1);
  assert.deepEqual(r.archive,[old]);
 }
});
test("invalid duplicate input or oversized D1 baseline cannot silently pass",()=>{
 const old=make();
 assert.throws(()=>partition([old,old],[old]),/DERIVED_NEWS_IMMUTABLE_CANONICAL_INVALID/);
 assert.throws(()=>partition([],[old,old]),/DERIVED_NEWS_IMMUTABLE_PROPOSED_INVALID/);
 assert.throws(()=>partition(Array(601).fill(old),[old]),/DERIVED_NEWS_IMMUTABLE_ADMISSION_INPUT_INVALID/);
});
