import test from "node:test";
import assert from "node:assert/strict";
import {verifyThreeDomainLivePublication} from "./verify-three-domain-outside-in.mjs";
const now=Date.parse("2026-11-02T00:00:00.000Z");
const at="2026-11-01T23:10:00.000Z";
const categories=["geopolitics","macro","rare_earth"];
const signals=categories.map((category,i)=>({
 id:category+"-"+String(i+1).padStart(8,"0"),
 category,title:"Geomacro finds "+category+" source announced a concrete development "+i,
 published_at:"2026-11-01T22:00:00.000Z",date_precision:"exact",
 status:i===0?"official_release_observed_unscored":"osint_feed_observed_unverified",
 same_event_corrob_verified:false,severity:null,
}));
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const latest={ok:true,schema:"geomacro.website-derived-news-feed.v1",
  checked_at:at,retention_hours:72,chargeable:false,scored:false,
  delivery_scope:"free_website_only",supabase_dependency:false,signals:clone(signals)};
 const index={schema:"geomacro.permanent-derived-news-archive-index.v1",
  updated_at:at,total_signals:1234};
 const coverage={schema:"geomacro.free-derived-archive-eligibility.v1",checked_at:at,
  retention_hours:72,signed_or_scored:false,paid_customer_eligible:false,
  live_payment_authorized:false};
 const daily={ok:true,schema:"geomacro.public-daily-official-finds.v1",
  generated_at:at,chargeable:false,official_only:true,signals:[clone(signals[0])]};
 const journal={ok:true,schema:"geomacro.website-derived-news-bundle.v1",
  checked_at:"2026-11-01T23:59:40.000Z",complete:true,item_cap:600,
  returned_rows:3,signals:clone(signals)};
 const htmlByCategory=Object.fromEntries(categories.map((c,i)=>[c,
  "<html><body>What changed in the world "+signals[i].title+"</body></html>"]));
 return {index,latest,coverage,daily,journal,htmlByCategory,now};
}
test("three category exact public D1/native-date/static/SSR agreement succeeds",()=>{
 const r=verifyThreeDomainLivePublication(fixture());
 assert.equal(r.verified,true);
 assert.equal(r.static_latest_rows,3);
 assert.equal(r.category.rare_earth.matching_public_d1_ids,1);
 assert.equal(r.category.macro.unverified_osint,1);
 assert.equal(r.canonical_private_d1_write_receipt_verified,false);
 assert.equal(r.payments,0);
});
test("reject public D1 original date conflict or missing category proof",()=>{
 const x=fixture();x.journal.signals[2].published_at="2026-11-01T21:00:00.000Z";
 assert.throws(()=>verifyThreeDomainLivePublication(x),
  /THREE_DOMAIN_LIVE_D1_PUBLIC_JOURNAL_EXACT_ID_MISMATCH_rare_earth/);
 const y=fixture();delete y.htmlByCategory.macro;
 assert.throws(()=>verifyThreeDomainLivePublication(y),/THREE_DOMAIN_LIVE_WEBSITE_HTML_macro/);
});
test("reject mismatched static cohort and 72h-expired proof",()=>{
 const x=fixture();x.coverage.checked_at="2026-11-01T22:00:00.000Z";
 assert.throws(()=>verifyThreeDomainLivePublication(x),/THREE_DOMAIN_LIVE_STATIC_COHORT_CLOCK_MISMATCH/);
 const y=fixture();y.latest.signals[0].published_at="2026-10-25T00:00:00.000Z";
 assert.throws(()=>verifyThreeDomainLivePublication(y),/THREE_DOMAIN_LIVE_STATIC_NATIVE_OR_ID_INVALID/);
});

test("normalizes headline HTML entities and ignores only clock-expired static rows",()=>{
 const entities=fixture();
 entities.latest.signals[0].title="Geomacro finds UN announced &#x27;new agreement&#x27; this morning";
 entities.htmlByCategory.geopolitics="<html><body>What changed in the world Geomacro finds UN announced 'new agreement' this morning</body></html>";
 assert.equal(verifyThreeDomainLivePublication(entities).category.geopolitics.website_rendered_matching_archive,1);
 const expired=fixture();
 expired.latest.signals[0].published_at="2026-10-29T23:59:59.000Z";
 expired.requirePositive=false;
 const receipt=verifyThreeDomainLivePublication(expired);
 assert.equal(receipt.category.geopolitics.live_72h_rows,0);
 assert.equal(receipt.category.geopolitics.expired_since_snapshot,1);
 assert.equal(receipt.category.macro.live_72h_rows,1);
});
