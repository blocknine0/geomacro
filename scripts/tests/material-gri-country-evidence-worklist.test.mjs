import {test} from "node:test";
import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {buildMaterialGriNewsReviewQueue} from "../lib/material-gri-news-review.mjs";
import {canonicalMaterialGriCountryLookup,
 buildMaterialGriCountryEvidenceWorklist} from "../lib/material-gri-country-evidence-worklist.mjs";

const registry=readFileSync("src/lib/canonical-country-registry-195.ts","utf8");
const now=Date.parse("2026-10-18T10:00:00.000Z");
const cat=["geopolitics","macro","rare_earth"];
const signal=(category,id,geography="India",at="2026-10-18T08:00:00Z")=>({
  id:category+"-"+id,category,geography,
  published_at:at,date_precision:"exact",
  status:"official_release_observed_unscored",
  same_event_corrob_verified:false,
  observed_release_count:1,severity:null,
  development_type:category==="macro"?"monetary policy":
    category==="geopolitics"?"security":"production",
  sourceUrl:"https://publishers.invalid/full-secret",
  title:"RESTRICTED publisher headline never sent downstream",
  raw_article_html:"SECRET ARTICLE",
});
const reports=Object.fromEntries(cat.map(category=>[
  category,{category,checked_at:new Date(now).toISOString(),
    healthy_feed_count:2,signals:[signal(category,"abcd1234")]},
]));
const queue=()=>buildMaterialGriNewsReviewQueue(cat.map(c=>reports[c]),now);

test("maps 195 exact country names with no substring, unknown or fabricated geographic claim",()=>{
  const map=canonicalMaterialGriCountryLookup(registry);
  assert.equal(map.count,195);
  assert.equal(map.resolve("India"),"IND");
  assert.equal(map.resolve("United States"),"USA");
  assert.equal(map.resolve("PSE"),"PSE");
  assert.equal(map.resolve("Holy See"),"VAT");
  assert.equal(map.resolve("uS"),"USA");
  for(const wrong of ["IndiaMart","United States / Mexico","Asia","Global","EU",
    "Republic of Atlantis","TWN","UNK","India, Pakistan"])
    assert.equal(map.resolve(wrong),null,wrong);
});
test("produce three-domain canonical safe review tasks, not eligible GRI score",()=>{
  reports.rare_earth={...reports.rare_earth,
    signals:[signal("rare_earth","abcd1234","Global")]};
  const q=queue();
  const x=buildMaterialGriCountryEvidenceWorklist(q,registry,now);
  assert.equal(x.canonical_country_registry_count,195);
  assert.deepEqual(x.categories.map(v=>v.review_targets.length),[1,1,1]);
  assert.equal(x.categories[0].review_targets[0].country_iso3,"IND");
  assert.equal(x.categories[2].review_targets[0].country_iso3,null);
  assert.equal(x.categories[2].review_targets[0].status,
    "GEOGRAPHY_UNRESOLVED_REVIEW_REQUIRED");
  assert.equal(x.categories[0].within_6h_original_recheck_window,1);
  assert.equal(x.numerical_gri_recomputed,false);
  assert.equal(x.signed_gri_or_country_certificate_created,false);
  assert.equal(x.public_gri_or_indices_written,false);
  assert.equal(x.promotion_status,
    "WAITING_FOR_SEPARATELY_SIGNED_THREE_DOMAIN_GRI_INPUTS");
  assert.equal(x.required_ready_event,"gri_reviewed_current_ready");
  const t=JSON.stringify(x);
  for(const forbidden of ["SECRET ARTICLE","https://","publishers.invalid",
    "RESTRICTED publisher","sourceUrl","raw_article_html","headline"])
    assert.equal(t.includes(forbidden),false,forbidden);
});
test("worklist fails closed on forged scoring, commercial rights or source status",()=>{
  const current=queue();
  const row=current.categories[0].candidates[0];
  const corruptions=[
    {gri_risk_score:64},{independent_originals_verified:true},
    {article_use_rights_verified:true},{gri_scoring_authorized:true},
    {risk_indices_update_authorized:true},{materiality_or_impact_verified:true},
    {customer_delivery_authorized:true},{evidence_class:"COMMERCIAL_VERIFIED"},
  ];
  for(const forged of corruptions){
    const altered={...current,categories:[{...current.categories[0],
      candidates:[{...row,...forged}]},...current.categories.slice(1)]};
    assert.throws(()=>buildMaterialGriCountryEvidenceWorklist(altered,registry,now),
      /MATERIAL_GRI_UNSCORED_REVIEW_QUEUE_REQUIRED/);
  }
});
test("no mistaken approval from 72h backlog when six-hour native-original window elapsed",()=>{
  reports.geopolitics={...reports.geopolitics,
    signals:[signal("geopolitics","abcd1234","India","2026-10-16T10:00:00Z")]};
  const x=buildMaterialGriCountryEvidenceWorklist(queue(),registry,now);
  assert.equal(x.categories[0].within_6h_original_recheck_window,0);
  assert.equal(x.categories[0].review_targets[0].gri_score,null);
  assert.equal(x.categories[0].review_targets[0].public_gri_promotion_authorized,false);
});
test("do not treat absent events as zero real-world risk, keep three categories",()=>{
  const empty=buildMaterialGriNewsReviewQueue(cat.map(category=>({
    category,checked_at:new Date(now).toISOString(),healthy_feed_count:1,signals:[],
  })),now);
  const work=buildMaterialGriCountryEvidenceWorklist(empty,registry,now);
  assert.equal(work.categories.length,3);
  assert.deepEqual(work.categories.map(x=>x.review_targets.length),[0,0,0]);
  assert.equal(work.numerical_gri_recomputed,false);
  assert.throws(()=>buildMaterialGriCountryEvidenceWorklist(
    {...empty,categories:empty.categories.slice(0,2)},registry,now));
});
