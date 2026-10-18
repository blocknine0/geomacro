import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {selectFreshIntelligenceFromReviewedGri} from "./gri-reviewed-to-current-intelligence.mjs";

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
    const rows=[item("a","geopolitics",20),item("b","macro",40),
      item("c","rare_earth",age)];
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
