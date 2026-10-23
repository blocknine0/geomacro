import test from "node:test";
import assert from "node:assert/strict";
import {gunzipSync} from "node:zlib";
import {buildPrivateOriginalReviewArchive,
 verifyPrivateOriginalReviewArchive,archivePrivateOriginalReviewLeads}
 from "./private-original-review-b2-handoff.mjs";

const now=new Date("2026-10-23T20:00:00.000Z");
const lead=Object.freeze({
 schema:"geomacro.private-original-signing-review-lead.v1",
 disposition:"GENUINE_HTML_BYTES_DATE_VERIFIED_FACTS_AND_RIGHTS_PENDING",
 country_iso3:"IND",category:"macro",
 issuer_organization_id:"official-example-issuer",
 publisher_family:"official_feed",
 original_article_url:"https://official.example.org/release/not-for-public-logs",
 original_article_title:"Official central-bank policy meeting decision",
 original_article_identity_sha256:"a".repeat(64),
 original_html_sha256:"b".repeat(64),
 native_original_publication_at:"2026-10-23T19:30:00.000Z",
 observed_at:"2026-10-23T19:40:00.000Z",
 independent_original_count:0,
 semantic_event_claim_verified:false,
 country_topic_factual_scope_review_pending:true,
 original_article_commercial_rights_verified:false,
 source_registry_rights_qualified:false,
 reviewed_event_identity:null,rights_receipt_sha256:null,
 facts_signature:null,rights_signature:null,
 commercial_eligible:false,
});
const quota=(total=15)=>({
 schema:"geomacro.b2-account-quota-status.v1",ok:true,
 day_utc:"2026-10-23",
 account_wide_reporting_requires_all_clients_governed:true,
 used:{total,GET:7,PUT:8,HEAD:0,NATIVE_AUTH:0},
 limits:{total:100,GET:45,PUT:55,HEAD:10,NATIVE_AUTH:10},
});
const fakeClient=()=>({
 calls:0,async putWithMetadataVerification(key,data,{verifyRestored}){
  assert.match(key,/^geomacro-evidence\/v1\/private\/original-pre-review\/2026\/10\/23\/[a-f0-9]{64}\.json\.gz$/);
  const internal=JSON.parse(gunzipSync(data).toString("utf8"));
  assert.equal(internal.leads[0].original_article_url,lead.original_article_url);
  assert.equal(verifyRestored(Buffer.from(data)),true);
  this.calls++;
  return {full_body_readback_verified:true,sha256:key.split("/").at(-1).slice(0,64),
   bytes:data.length};
 }
});
test("a zero-lead intake incurs ZERO B2 or governor calls and never invents rights",async()=>{
 const r=await archivePrivateOriginalReviewLeads({
  leads:[],now,countryIso3:"IND",
  b2Factory:()=>{throw Error("B2_FORBIDDEN")},
  quotaGovernor:{status:async()=>{throw Error("D1_FORBIDDEN")}},
 });
 assert.equal(r.status,"NO_GENUINE_LEADS_TO_ARCHIVE");
 assert.equal(r.private_review_hand_off_available,false);
 assert.equal(r.payments,0);
});
test("genuine original-only lead is privately retained with full compressed SHA/gzip readback, receipt scrubbed",async()=>{
 const b2=fakeClient();
 const r=await archivePrivateOriginalReviewLeads({
  leads:[lead],now,countryIso3:"IND",
  b2Factory:()=>b2,quotaGovernor:{status:async()=>quota()},
 });
 assert.equal(b2.calls,1);
 assert.equal(r.status,"GENUINE_PRE_REVIEW_LEADS_PRIVATELY_ARCHIVED");
 assert.equal(r.private_original_leads_archived,1);
 assert.equal(r.private_review_hand_off_available,true);
 assert.equal(r.original_lead_category_counts.macro,1);
 assert.equal(r.signed_gri_created,false);
 assert.equal(r.source_rights_or_facts_signed,false);
 assert.equal(r.commercial_eligible,false);
 assert.equal(r.payments,0);
 const published=JSON.stringify(r);
 for(const secret of [lead.original_article_url,lead.original_article_title,
  lead.original_html_sha256,lead.original_article_identity_sha256,
  "official-example-issuer","geomacro-evidence/v1/private/"])
  assert.equal(published.includes(secret),false);
});
test("real source facts/rights, native clock, country and certificate scope never self-approve",()=>{
 for(const changed of [
  {...lead,commercial_eligible:true},
  {...lead,semantic_event_claim_verified:true},
  {...lead,source_registry_rights_qualified:true},
  {...lead,original_article_commercial_rights_verified:true},
  {...lead,facts_signature:"made-up"},
  {...lead,original_article_url:"http://official.example.org/foo"},
  {...lead,native_original_publication_at:"2026-10-21T00:00:00Z"},
  {...lead,native_original_publication_at:"2026-10-24T01:00:00Z"},
  {...lead,country_iso3:"USA"},
 ]){
  assert.throws(()=>buildPrivateOriginalReviewArchive([changed],{
   countryIso3:"IND",now
  }),/PRIVATE_ORIGINAL_B2_HANDOFF_/);
 }
 assert.throws(()=>buildPrivateOriginalReviewArchive([lead,lead],{
  countryIso3:"IND",now
 }),/PRIVATE_ORIGINAL_B2_HANDOFF_PRIVATE_LEAD_COUNTRY_CLOCK_OR_UNIQUENESS_INVALID/);
});
test("governed B2 limit holds without opening B2, no false retained claim",async()=>{
 let factoryCalls=0;
 const r=await archivePrivateOriginalReviewLeads({
  leads:[lead],now,countryIso3:"IND",
  quotaGovernor:{status:async()=>quota(97)},
  b2Factory:()=>{factoryCalls++;throw Error("B2_FORBIDDEN");},
 });
 assert.equal(factoryCalls,0);
 assert.equal(r.status,"SHARED_B2_QUOTA_HELD_NOT_ARCHIVED");
 assert.equal(r.private_review_hand_off_available,false);
 assert.equal(r.signed_gri_created,false);
});
test("a failed/corrupt or unrecoverable B2 put/readback never claims success",async()=>{
 const plan=buildPrivateOriginalReviewArchive([lead],{now,countryIso3:"IND"});
 assert.throws(()=>verifyPrivateOriginalReviewArchive(Buffer.from("wrong"),plan),
  /PRIVATE_ORIGINAL_B2_HANDOFF_IMMUTABLE_B2_BYTES_READBACK_MISMATCH/);
 await assert.rejects(()=>archivePrivateOriginalReviewLeads({
  leads:[lead],now,countryIso3:"IND",quotaGovernor:{status:async()=>quota()},
  b2Factory:()=>({async putWithMetadataVerification(){return{
   full_body_readback_verified:false,sha256:plan.compressedSha256,
   bytes:plan.compressed.length};}})
 }),/PRIVATE_ORIGINAL_B2_HANDOFF_VERIFIED_PRIVATE_B2_READBACK_REQUIRED/);
});
