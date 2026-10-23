import test from "node:test";
import assert from "node:assert/strict";
import {summarizePrivateOriginalIntakeFunnel} from "./private-original-intake-funnel.mjs";
const domains=["geopolitics","macro","rare_earth"];
const counts=()=>Object.fromEntries(domains.map(d=>[d,0]));
const input=({country="USA",probes=[],candidates=[],pages=[],attempts=0,bytes=0,leads=0}={})=>({
 discovery:{discovery:{network_attempts:12,source_probes:probes},
   private_original_review_candidates:candidates},
 pages:{attempted:attempts,verified_candidates:pages},
 receipt:{country_iso3:country,byte_exact_rereads_attempted:bytes,
   distinct_source_verified_pre_review_leads:leads,
   verified_original_counts_by_category:counts()},
});
test("No candidate does not manufacture one of 585 commercial cells",()=>{
 const report=summarizePrivateOriginalIntakeFunnel(input({country:"MWI",
  probes:[{category:"macro",retrieval_state:"NO_MATCHING_RECORDS",
   observed_record_count:0}]}));
 assert.equal(report.next_required_gate,"NO_CURRENT_FIRST_PARTY_CANDIDATE_DISCOVERED");
 assert.deepEqual(report.original_candidates_by_category,counts());
 assert.equal(report.one_country_is_not_195_country_coverage,true);
 assert.equal(report.payment_authorized,false);
});
test("Distinct diagnosis for observed publisher records with no matching country/topic original",()=>{
 const report=summarizePrivateOriginalIntakeFunnel(input({country:"MUS",
  probes:[{category:"rare_earth",retrieval_state:"RECORDS_OBSERVED",
   observed_record_count:4,feed_audit:{inspected:11,country_mentioned:0}}]}));
 assert.equal(report.next_required_gate,
  "COUNTRY_TOPIC_OR_ORIGINAL_PUBLISHER_MATCH_NOT_CONFIRMED");
 assert.equal(report.feed_stage_counter_sums_not_unique_events.inspected,11);
 assert.equal(report.source_probe_record_observations_by_category.rare_earth,4);
});
test("Provider denials stay visible without bypass or 195 readiness claims",()=>{
 const report=summarizePrivateOriginalIntakeFunnel(input({
  probes:[{category:"geopolitics",retrieval_state:"RATE_LIMITED"},
    {category:"macro",retrieval_state:"ACCESS_RESTRICTED"}]}));
 assert.equal(report.next_required_gate,"SOURCE_TRANSPORT_ACCESS_OR_QUOTA_DEGRADED");
 assert.equal(report.source_probe_retrieval_states.RATE_LIMITED,1);
 assert.equal(report.source_probe_retrieval_states.ACCESS_RESTRICTED,1);
});
test("Page and bytes are separate proof gates, not source licence",()=>{
 const candidate={domain:"macro",article_url:"https://secret.example/item",article_title:"Secret title"};
 const a=input({candidates:[candidate],pages:[],attempts:1});
 const r=summarizePrivateOriginalIntakeFunnel(a);
 assert.equal(r.next_required_gate,"ORIGINAL_PAGE_OR_NATIVE_DATE_UNVERIFIED");
 const b=summarizePrivateOriginalIntakeFunnel(input({
  candidates:[candidate],pages:[candidate],attempts:1,bytes:1,leads:1
 }));
 assert.equal(b.next_required_gate,"PRIVATE_FACTS_AND_RIGHTS_REVIEW_PENDING");
 assert.equal(b.gri_scored,false);
 assert.equal(b.rights_signed_or_granted,false);
 const publicBytes=JSON.stringify(b);
 assert.ok(!publicBytes.includes("secret.example"));
 assert.ok(!publicBytes.includes("Secret title"));
});
test("Mixed source-denial and available-feed mismatch remains a distinct actionable blocker",()=>{
 const x=summarizePrivateOriginalIntakeFunnel(input({country:"MWI",
  probes:[{category:"macro",retrieval_state:"NO_MATCHING_RECORDS",observed_record_count:0,
    feed_audit:{inspected:90,native_dated:50,country_mentioned:0}},
    {category:"rare_earth",retrieval_state:"RATE_LIMITED"},
    {category:"geopolitics",retrieval_state:"TRANSPORT_UNAVAILABLE"},
    {category:"geopolitics",retrieval_state:"COOLDOWN_ACTIVE"}]}));
 assert.equal(x.next_required_gate,"COUNTRY_TOPIC_AND_PROVIDER_TRANSPORT_DEGRADED");
 assert.equal(x.degraded_source_probe_count,3);
 assert.equal(x.country_topic_match_unconfirmed,true);
 assert.equal(x.paid_delivery_eligible,false);
});
test("Counter semantics and impossible stage promotions fail closed",()=>{
 assert.throws(()=>summarizePrivateOriginalIntakeFunnel(input({
  pages:[{domain:"macro"}],attempts:0})),/STAGE_MISMATCH/);
 assert.throws(()=>summarizePrivateOriginalIntakeFunnel(input({
  attempts:1,bytes:2})),/STAGE_MISMATCH/);
 assert.throws(()=>summarizePrivateOriginalIntakeFunnel({
  ...input(),discovery:{discovery:{network_attempts:-1,source_probes:[]},
   private_original_review_candidates:[]}
 }),/INVALID/);
});
