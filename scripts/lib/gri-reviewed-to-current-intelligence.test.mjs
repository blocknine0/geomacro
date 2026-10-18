import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {selectFreshIntelligenceFromReviewedGri,mayPromoteNewerReviewedIntelligence} from "./gri-reviewed-to-current-intelligence.mjs";

const now=new Date("2026-10-18T10:00:00Z");
const item=(id,category,ageMin)=>({
  id,category,published_at:new Date(now.getTime()-ageMin*60_000).toISOString(),
  created_at:new Date(now.getTime()-ageMin*60_000).toISOString(),
});
const signed=(rows)=>({customerRows:rows,eventPackages:rows.map(r=>({
  category:r.category,event:{country_iso3:"USA"},sources:[],
}))});
test("three genuinely recent categories may be selected only as candidates; no scoring or licensing implied",()=>{
  const result=selectFreshIntelligenceFromReviewedGri(signed([
    item("a","geopolitics",45),item("b","macro",70),item("c","rare_earth",100),
  ]),now);
  assert.equal(result.ready,true);
  assert.equal(result.rows.length,3);
  assert.equal(result.source_originals_still_verified,false);
  assert.equal(result.original_source_count_claimed,0);
  assert.equal(result.b2_requests+result.d1_writes+result.payment_attempts,0);
});
test("GRI 72-hour retained older sources cannot silently become current 6-hour Intelligence",()=>{
  const result=selectFreshIntelligenceFromReviewedGri(signed([
    item("a","geopolitics",45),item("b","macro",500),item("c","rare_earth",2800),
  ]),now);
  assert.equal(result.ready,false);
  assert.equal(result.reason,"CURRENT_SIX_HOUR_THREE_DOMAIN_ORIGINALS_MISSING");
  assert.equal(result.rows,null);
});
test("current replacement records still require same-domain identity and independent rights qualifier",()=>{
  const rows=[
    item("a","geopolitics",20),item("b","macro",500),item("b2","macro",40),
    item("c","rare_earth",60),
  ];
  const result=selectFreshIntelligenceFromReviewedGri(signed(rows),now);
  assert.equal(result.ready,true);
  assert.deepEqual(result.rows.map(x=>x.id),["a","b2","c"]);
  assert.equal(result.source_originals_still_verified,false);
});
test("ineligible future/invalid timestamps cannot become current",()=>{
  for(const age of [-5,NaN]){
    const invalid=item("c","rare_earth",60);
    if(Number.isNaN(age))invalid.published_at="invalid-native-clock";
    else invalid.published_at=new Date(now.getTime()-age*60_000).toISOString();
    const rows=[item("a","geopolitics",20),item("b","macro",40),invalid];
    assert.equal(selectFreshIntelligenceFromReviewedGri(signed(rows),now).ready,false);
  }
});
test("duplicate current claims and package category mismatch are not normalized away",()=>{
  const rows=[item("a","geopolitics",20),item("b","macro",30),item("c","rare_earth",50)];
  assert.throws(()=>selectFreshIntelligenceFromReviewedGri(
    {customerRows:rows,eventPackages:[{category:"macro"},
      {category:"macro"},{category:"rare_earth"}]},now),/CATEGORY_IDENTITY_INVALID/u);
});
test("publisher continuation rechecks signed GRI and independent source qualification",()=>{
  const module=readFileSync("scripts/lib/gri-reviewed-to-current-intelligence.mjs","utf8");
  for(const term of ["preflightReviewedCurrentGlobalRisk({",
    "qualifyIndependentSameEvent({","verified.receipt.commercial_event_admission",
    "source_originals_still_verified:true"])
    assert.ok(module.includes(term),term);
  const cli=readFileSync("scripts/ops/prepare-intelligence-from-reviewed-gri.mjs","utf8");
  assert.ok(cli.includes("approvedIndependentReviewerFromEnv()"));
  assert.ok(cli.includes("EXACT_REVIEWED_INPUT_SHA_MISMATCH"));
  assert.ok(cli.includes("payment_executed:false"));
  assert.ok(!cli.includes("settleCoinbaseX402("));
  assert.ok(!cli.includes("RISK_OBJECT_SIGNING_PRIVATE_KEY"));
});

test("never overwrite an already newer current verified Intelligence B2 pointer",async()=>{
  const clock=new Date();
  const old=new Date(clock.getTime()-25*60_000).toISOString();
  const latest=new Date(clock.getTime()-10*60_000).toISOString();
  const rows=[item("a","geopolitics",30),item("b","macro",50),item("c","rare_earth",90)]
    .map(x=>({...x,published_at:old}));
  const result=await mayPromoteNewerReviewedIntelligence({rows,fetchImpl:async()=>new Response(
    JSON.stringify({ok:true,product:"intelligence",source_as_of:latest,
      full_b2_readback_verified:true,exact_gzip_restore_verified:true}),{status:200,
        headers:{"content-type":"application/json"}})});
  assert.equal(result.canPublish,false);
  assert.equal(result.reason,"CURRENT_INTELLIGENCE_HAS_EQUAL_OR_NEWER_ORIGINAL");
});
test("missing old D1 hot Intelligence allows genuinely eligible new verified batch",async()=>{
  const rows=[{published_at:new Date().toISOString()},
    {published_at:new Date().toISOString()},{published_at:new Date().toISOString()}];
  const result=await mayPromoteNewerReviewedIntelligence({rows,
    fetchImpl:async()=>new Response(JSON.stringify({error:"HOT_SNAPSHOT_STALE_OR_INVALID"}),{status:503})});
  assert.equal(result.canPublish,true);
  assert.equal(result.reason,"NO_CURRENT_VERIFIED_INTELLIGENCE");
});
test("untrusted 200 and transport failure fail closed before a B2 overwrite",async()=>{
  const rows=[{published_at:new Date().toISOString()},
    {published_at:new Date().toISOString()},{published_at:new Date().toISOString()}];
  await assert.rejects(()=>mayPromoteNewerReviewedIntelligence({rows,
    fetchImpl:async()=>new Response("{}",{status:200})}),/PROOF_INVALID/u);
  await assert.rejects(()=>mayPromoteNewerReviewedIntelligence({rows,
    fetchImpl:async()=>{throw Error("blocked")}}),/READ_UNAVAILABLE/u);
});
