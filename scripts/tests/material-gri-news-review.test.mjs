import {test} from "node:test";
import {strict as assert} from "node:assert";
import {buildMaterialGriNewsReviewQueue,buildMaterialGriReviewFromDerivedD1} from "../lib/material-gri-news-review.mjs";
const now=Date.parse("2026-10-18T10:00:00.000Z");
const categories=["geopolitics","macro","rare_earth"];
const base=(category,kind,at="2026-10-18T08:00:00.000Z")=>({
  id:category+"-abcd1234",category,
  published_at:at,date_precision:"exact",
  status:"official_release_observed_unscored",
  observed_release_count:1,same_event_corrob_verified:false,severity:null,
  development_type:kind,geography:"India",
  title:"Publisher secret title must never be persisted",articleUrl:"https://secret.invalid/a",
  sourceId:"secret_feeder",why_it_matters:"Publisher quote must never survive",
  original_article_body:"Confidential raw HTML",
});
const reports=(signals={})=>categories.map(category=>({
  category,checked_at:new Date(now).toISOString(),healthy_feed_count:3,
  signals:signals[category]??[],
}));
test("admit specific material event candidates in all three domains without scores or copied articles",()=>{
  const r=buildMaterialGriNewsReviewQueue(reports({
    geopolitics:[base("geopolitics","security")],
    macro:[base("macro","monetary policy")],
    rare_earth:[base("rare_earth","production")],
  }),now);
  assert.equal(r.retention_hours,72);
  assert.deepEqual(r.categories.map(x=>x.candidates_count),[1,1,1]);
  assert.deepEqual(r.categories.map(x=>x.candidates[0].event_kind),[
    "armed_security_change","central_bank_policy_decision","critical_mineral_production_milestone",
  ]);
  for(const c of r.categories){
    const q=c.candidates[0];
    assert.equal(q.independent_originals_verified,false);
    assert.equal(q.article_use_rights_verified,false);
    assert.equal(q.gri_risk_score,null);
    assert.equal(q.gri_scoring_authorized,false);
    assert.equal(q.risk_indices_update_authorized,false);
  }
  assert.equal(r.writes_to_gri,0);
  const str=JSON.stringify(r);
  for(const forbidden of ["Publisher secret","https://","secret_feeder","raw HTML",
    "Publisher quote","articleUrl","original_article_body"])
    assert.equal(str.includes(forbidden),false,forbidden);
});
test("exclude ordinary press releases/research and do not invent outcomes",()=>{
  const r=buildMaterialGriNewsReviewQueue(reports({
    geopolitics:[base("geopolitics","announcement")],
    macro:[base("macro","research")],
    rare_earth:[base("rare_earth","official update")],
  }),now);
  assert.deepEqual(r.categories.map(x=>x.candidates_count),[0,0,0]);
  assert.equal(r.is_prediction_market,false);
  assert.equal(r.gri_promotion_status,"BLOCKED_PENDING_INDEPENDENT_EVIDENCE_RIGHTS_AND_SIGNED_CERTIFICATION");
});
test("dedup same exact derived event, reject fabricated independent corroboration and wrong domain",()=>{
  const geo=base("geopolitics","security");
  const duplicate={...geo};
  const falseProof={...geo,id:"geopolitics-abcd9999",same_event_corrob_verified:true};
  const wrong={...geo,id:"macro-abcd4567"};
  const r=buildMaterialGriNewsReviewQueue(reports({geopolitics:[geo,duplicate,falseProof,wrong]}),now);
  assert.equal(r.categories[0].candidates_count,1);
});
test("fail closed for future, over-72h, early embargo or day-only date",()=>{
  const samples=[
    base("macro","monetary policy","2026-10-18T10:01:00Z"),
    base("macro","monetary policy","2026-10-15T09:00:00Z"),
    base("macro","monetary policy","2026-10-18T09:50:00Z"),
    {...base("macro","monetary policy","2026-10-18"),date_precision:"day"},
  ];
  const r=buildMaterialGriNewsReviewQueue(reports({macro:samples}),now);
  assert.equal(r.categories[1].candidates_count,0);
});
test("reject missing full three-domain report or stale source-health read",()=>{
  assert.throws(()=>buildMaterialGriNewsReviewQueue([],now),/THREE_CATEGORY/);
  const d=reports();d[2].healthy_feed_count=0;
  assert.throws(()=>buildMaterialGriNewsReviewQueue(d,now),/CURRENT_OFFICIAL/);
  const old=reports();old[1].checked_at="2026-10-18T09:30:00.000Z";
  assert.throws(()=>buildMaterialGriNewsReviewQueue(old,now),/CURRENT_OFFICIAL/);
});

test("Auto Ingest read-only D1 path never claims reverified issuer or scored GRI",()=>{
  const doc={ok:true,schema:"geomacro.website-derived-news-feed.v1",
    delivery_scope:"free_website_only",retention_days:3,retention_hours:72,
    original_release_delay_minutes:15,
    signals:[base("geopolitics","security"),base("macro","price data"),
      base("rare_earth","trade restriction")]};
  const q=buildMaterialGriReviewFromDerivedD1(doc,now);
  assert.deepEqual(q.categories.map(x=>x.candidates_count),[1,1,1]);
  assert.equal(q.original_source_reverified_in_this_run,false);
  assert.equal(q.provenance,"PREVIOUSLY_COLLECTED_D1_DERIVED_NEWS");
  assert.equal(q.writes_to_gri,0);
  assert.equal(q.payments,0);
  const value=JSON.stringify(q);
  assert.equal(value.includes("secret.invalid"),false);
  assert.equal(value.includes("Publisher quote"),false);
});
test("Auto Ingest fails closed if D1 journal is not 72h derived-only",()=>{
  for(const field of [{retention_hours:720},{retention_days:30},
    {delivery_scope:"raw_article"},{original_release_delay_minutes:0},
    {signals:new Array(251).fill(base("macro","price data"))}]){
    const doc={ok:true,schema:"geomacro.website-derived-news-feed.v1",
      delivery_scope:"free_website_only",retention_days:3,retention_hours:72,
      original_release_delay_minutes:15,signals:[],...field};
    assert.throws(()=>buildMaterialGriReviewFromDerivedD1(doc,now),/DERIVED_ONLY/);
  }
});
