import test from "node:test";
import assert from "node:assert/strict";
import {verifySharedArchivePartnerExpectation} from "../lib/website-shared-partner-expectation.mjs";
import {isPermanentArchiveSignal} from "../ops/publish-permanent-derived-news-archive.mjs";
import {verifyDerivedStory} from "../../workers/control-plane/src/website-derived-intelligence.mjs";

const NOW=Date.parse("2026-10-29T12:20:00.000Z");
function row(category,id,credit="",date="2026-10-29T10:00:00.000Z"){
 return {
  id:category+"-"+id,category,
  title:"Geomacro finds an official original policy development related to "+category,
  what_changed:"An original public issuer published a dated policy development for sector research.",
  why_it_matters:"The dated official observation informs research context, but no impact has been verified.",
  topic:category==="macro"?"monetary policy":category==="rare_earth"?"critical-minerals policy":"foreign policy",
  geography:null,development_type:"policy update",
  published_at:date,date_precision:"exact",observed_release_count:1,
  sources_credited:credit?[credit]:[],status:"official_release_observed_unscored",
  same_event_corrob_verified:false,severity:null,
 };
}
const geo=row("geopolitics","12345678");
const macro=row("macro","12345678","Federal Reserve Board");
const mineral=row("rare_earth","12345678","Unreviewed Mineral Publisher");

test("shared canonical D1 cohort accounts for all three categories and keeps unknown credits withheld",()=>{
 for(const s of [geo,macro,mineral]){
  assert.equal(isPermanentArchiveSignal(s,NOW,{allowHistorical:false}),true);
  assert.equal(verifyDerivedStory(s,NOW),true);
 }
 const result=verifySharedArchivePartnerExpectation([geo,macro,mineral],
  [mineral,macro,geo],NOW);
 assert.equal(result.eligible_archive_ids,3);
 assert.equal(result.missing_canonical_ids,0);
 assert.deepEqual(result.category_archive_eligible,{geopolitics:1,macro:1,rare_earth:1});
 assert.deepEqual(result.category_expected_attributed_partner_ids,
   {geopolitics:1,macro:1,rare_earth:0});
 assert.deepEqual(result.category_rights_credit_withheld,
   {geopolitics:0,macro:0,rare_earth:1});
 assert.equal(result.authenticated_partner_live_delivery_verified,false);
 assert.equal(result.additional_d1_reads,0);
 assert.equal(result.additional_partner_gets,0);
 assert.equal(result.payments,0);
});
test("official minerals attribution is included without deleting credit or original clock",()=>{
 const credited={...mineral,sources_credited:["Natural Resources Canada"]};
 const result=verifySharedArchivePartnerExpectation([credited],[credited],NOW);
 assert.equal(result.category_expected_attributed_partner_ids.rare_earth,1);
 assert.equal(result.category_rights_credit_withheld.rare_earth,0);
});
test("missing, divergent, duplicate or changed source-native clocks are never called passed",()=>{
 assert.throws(()=>verifySharedArchivePartnerExpectation([geo],[],NOW),/READBACK_INCOMPLETE/);
 assert.throws(()=>verifySharedArchivePartnerExpectation([geo],
   [{...geo,published_at:"2026-10-29T10:00:01.000Z"}],NOW),
   /PAYLOAD_OR_NATIVE_CLOCK_DIVERGENT/);
 assert.throws(()=>verifySharedArchivePartnerExpectation([geo,geo],[geo],NOW),
   /READBACK_ARCHIVE_ID_CONFLICT|ARCHIVE_DUPLICATE/);
});
test("stale original sources are not backdated to enter the rolling 72h feed",()=>{
 const old={...macro,published_at:"2026-10-20T10:00:00.000Z"};
 const result=verifySharedArchivePartnerExpectation([old],[],NOW);
 assert.equal(result.eligible_archive_ids,0);
 assert.deepEqual(result.category_expected_attributed_partner_ids,
  {geopolitics:0,macro:0,rare_earth:0});
});
