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

test("hourly primary, Auto Ingest and recovery all hand off only unscored country review",()=>{
  for(const path of [
    ".github/workflows/auto-ingest-news.yml",
    ".github/workflows/website-derived-news-continuity.yml",
    ".github/workflows/website-derived-news-cadence-backstop.yml",
  ]){
    const workflow=readFileSync(path,"utf8");
    assert.ok(workflow.includes(
      "node scripts/ops/build-material-gri-country-worklist.mjs"),path);
    assert.ok(workflow.includes(
      "material-gri-country-evidence-worklist.json"),path);
    assert.ok(workflow.includes("retention-days: 3"),path);
    assert.ok(!workflow.includes("gri_reviewed_current_ready"),path);
    assert.ok(!workflow.includes("publish-supabase-free-global-risk.mjs"),path);
  }
  const publisher=readFileSync(
    ".github/workflows/gri-v12-supabase-free-reviewed-current.yml","utf8");
  assert.ok(publisher.includes("types: [gri_reviewed_current_ready]"));
  assert.ok(publisher.includes("CURRENT_GRI_IMMUTABLE_INPUT_KEY_SHA_NOT_BOUND"));
  assert.ok(publisher.includes("REVIEWED_CERTIFICATES_B2_SHA256"));
  assert.ok(publisher.includes("publish-supabase-free-global-risk.mjs --verified-current"));
});

test("90m verified-native review triage is distinct from 6h recheck and stale 72h backlog",()=>{
  const reports=cat.map(category=>({
    category,checked_at:new Date(now).toISOString(),healthy_feed_count:1,signals:[],
  }));
  const by=Object.fromEntries(reports.map(x=>[x.category,x]));
  by.geopolitics.signals=[
    signal("geopolitics","fresh01","India","2026-10-18T09:15:00Z"),
    signal("geopolitics","fresh02","Global","2026-10-18T09:30:00Z"),
    // Exact timestamp still satisfies private 6-hour recheck but cannot
    // initiate a NEW 90-minute current GRI numerical computation.
    signal("geopolitics","older01","India","2026-10-18T07:00:00Z"),
  ];
  by.macro.signals=[signal("macro","older01","India","2026-10-18T07:55:00Z")];
  by.rare_earth.signals=[signal("rare_earth","older01","Australia","2026-10-18T02:30:00Z")];
  const input=buildMaterialGriNewsReviewQueue(cat.map(x=>by[x]),now);
  const w=buildMaterialGriCountryEvidenceWorklist(input,registry,now);
  assert.equal(w.current_native_original_90m_review_targets,2);
  assert.equal(w.current_native_original_90m_country_mapped_targets,1);
  assert.equal(w.categories[0].within_90m_new_gri_window,2);
  assert.equal(w.categories[0].within_90m_and_country_mapped,1);
  assert.deepEqual(w.categories.map(x=>x.within_90m_new_gri_window),[2,0,0]);
  assert.equal(w.categories[0].within_6h_original_recheck_window,3);
  const index=Object.fromEntries(w.categories.flatMap(x=>x.review_targets).map(x=>[x.derived_event_id,x]));
  assert.equal(index["geopolitics-fresh01"].materiality_review_priority,"IMMEDIATE_NATIVE_GRI_REVIEW");
  assert.equal(index["geopolitics-fresh01"].can_promote_from_worklist,false);
  assert.equal(index["geopolitics-fresh01"].gri_score,null);
  assert.equal(index["geopolitics-fresh02"].materiality_review_priority,"URGENT_COUNTRY_RESOLUTION");
  assert.equal(index["geopolitics-fresh02"].country_iso3,null);
  assert.equal(index["geopolitics-older01"].materiality_review_priority,"SOURCE_RECHECK_ONLY");
  assert.equal(index["geopolitics-older01"].candidate_within_90m_new_gri_window,false);
  assert.equal(index["geopolitics-older01"].candidate_within_6h_recheck_window,true);
  assert.equal(index["macro-older01"].materiality_review_priority,"SOURCE_RECHECK_ONLY");
  assert.equal(index["rare_earth-older01"].materiality_review_priority,"HISTORICAL_REVIEW_ONLY");
  assert.equal(index["rare_earth-older01"].candidate_within_6h_recheck_window,false);
  assert.equal(w.real_signed_gri_scoring_permission_inferred,false);
  assert.equal(w.numerical_gri_recomputed,false);
  assert.equal(w.signed_gri_or_country_certificate_created,false);
  assert.equal(w.public_gri_or_indices_written,false);
  assert.ok(w.categories[0].review_targets[0].candidate_within_90m_new_gri_window);
  const serialized=JSON.stringify(w);
  for(const forbidden of ["SECRET ARTICLE","publishers.invalid","sourceUrl","raw_article_html"])
    assert.equal(serialized.includes(forbidden),false);
});

test("calendar-day releases and timestamps within 15-minute embargo cannot trigger numerical GRI",()=>{
  const signals=[
    signal("geopolitics","embargo1","India","2026-10-18T09:50:00Z"),
    {...signal("geopolitics","daytime","India","2026-10-16T00:00:00Z"),
      date_precision:"day",published_at:"2026-10-16"},
  ];
  const input=buildMaterialGriNewsReviewQueue(cat.map(category=>({
    category,checked_at:new Date(now).toISOString(),healthy_feed_count:1,
    signals:category==="geopolitics"?signals:[],
  })),now);
  const w=buildMaterialGriCountryEvidenceWorklist(input,registry,now);
  assert.equal(w.current_native_original_90m_review_targets,0);
  assert.equal(w.categories[0].within_90m_new_gri_window,0);
  assert.equal(w.categories[0].within_6h_original_recheck_window,0);
  assert.equal(w.categories[0].review_targets.length,1);
  assert.equal(w.categories[0].review_targets[0].materiality_review_priority,"HISTORICAL_REVIEW_ONLY");
});
