import test from "node:test";
import assert from "node:assert/strict";
import {evaluatePulsePrivateScoringTrigger} from "../lib/auto-private-scoring-trigger.mjs";

const checked_at="2026-10-11T06:00:00.000Z";
const now=new Date("2026-10-11T06:04:00.000Z");
const good=(newCount=1)=>({
  schema:"geomacro.private-30m-source-pulse-d1-write-receipt.v1",
  checked_at,rows_written:3,d1_readback_verified:true,
  new_private_original_article_fingerprints:newCount,
  repeated_private_original_article_fingerprints:0,
  original_article_identity_is_risk_event:false,
  source_current_scored_intelligence_verified:false,
  b2_requests:0,supabase_requests:0,payment_performed:false,
});
test("new source-native original fingerprints trigger PRIVATE canonical rescoring only",()=>{
  const proof=evaluatePulsePrivateScoringTrigger(good(),now);
  assert.equal(proof.private_scoring_needed,true);
  assert.equal(proof.public_published,false);
  assert.equal(proof.commercial_eligible,false);
  assert.equal(proof.independently_verified_current_intelligence,false);
  assert.deepEqual(Object.keys(proof).sort(),[
    "commercial_eligible","independently_verified_current_intelligence",
    "new_original_fingerprints","payment_performed","private_scoring_needed",
    "selected_classifier_refs","selected_retries",
    "public_published","status","supabase_writes",
  ].sort());
});
test("still-unacknowledged verified D1 retry can safely wake private scorer",()=>{
  const p=evaluatePulsePrivateScoringTrigger({...good(0),
    repeated_private_original_article_fingerprints:3,
    selected_private_classifier_ref_count:1,
    selected_private_classifier_retry_count:1,
  },now);
  assert.equal(p.private_scoring_needed,true);
  assert.equal(p.selected_retries,1);
  assert.equal(p.commercial_eligible,false);
});
test("empty or deduped pulse cannot burn model/B2 quotas",()=>{
  const p=evaluatePulsePrivateScoringTrigger({...good(0),
    repeated_private_original_article_fingerprints:12},now);
  assert.equal(p.private_scoring_needed,false);
  assert.match(p.status,/NO_MODEL_OR_B2_REQUESTS/);
});
test("all guarded D1 readback, date, bounds, and no-money claims are mandatory",()=>{
  const bad=[
    {schema:"forged"},{rows_written:2},{d1_readback_verified:false},
    {original_article_identity_is_risk_event:true},
    {source_current_scored_intelligence_verified:true},
    {b2_requests:1},{supabase_requests:1},{payment_performed:true},
    {new_private_original_article_fingerprints:-1},
    {new_private_original_article_fingerprints:241},
    {new_private_original_article_fingerprints:"1"},
    {repeated_private_original_article_fingerprints:-1},
    {repeated_private_original_article_fingerprints:241},
    {checked_at:"2026-10-10T05:00:00.000Z"},
    {checked_at:"2026-10-11T06:05:00.000Z"},
    {checked_at:"2026-10-11"},
  ];
  for(const patch of bad)assert.throws(
    ()=>evaluatePulsePrivateScoringTrigger({...good(),...patch},now),
    /PRIVATE_SCORING_PULSE_D1_PROOF_INVALID/,JSON.stringify(patch));
});
test("missing/uncorroborated or invalid proof cannot accidentally trigger",()=>{
  assert.throws(()=>evaluatePulsePrivateScoringTrigger(undefined,now));
  assert.throws(()=>evaluatePulsePrivateScoringTrigger({},now));
  assert.throws(()=>evaluatePulsePrivateScoringTrigger(good(),new Date("invalid")));
});
