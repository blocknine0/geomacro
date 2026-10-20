import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildInternalResearchReviewPacket} from "../verify-telegram-manual-research-review.mjs";

test("Telegram HUMINT is human-attested, redacted and never AI, source scraping, a paid offer or an approved original",()=>{
  const pointer={schema:"geomacro.telegram-human-research-lead.v1",
    reference_id:"tgresearch_"+"a".repeat(32),reference_sha256:"b".repeat(64),
    category:"CRITICAL_MINERALS",topic_code:"EXPORT_CONTROL",
    country_iso3:"KAZ",
    source_native_published_at_claimed:"2026-10-20T14:05:00Z",
    observed_at:"2026-10-20T14:10:00Z",
    historical_reference:false,source_kind:"PUBLIC_TELEGRAM_MANUALLY_VIEWED",
    reference_registered:true,human_reference_attested:true,
    source_native_time_independently_verified:false,
    automated_collection_authorized:false,has_source_message_payload:false,
    verification_status:"UNVERIFIED",editorial_status:"PENDING_INDEPENDENT_RESEARCH",
    scoring_eligible:false,commercial_eligible:false,public_published:false};
  const input={schema:"geomacro.internal-manual-corroboration-review.v1",
    human_review_requested:true,research_pointer:pointer,
    official_evidence_candidates:[]};
  const packet=buildInternalResearchReviewPacket(input,new Date("2026-10-20T14:20:00Z"));
  assert.equal(packet.status,"PENDING_INDEPENDENT_FACT_CHECK");
  for(const key of ["corroboration_verified","reviewer_final_approval",
   "source_rights_verified","commercial_eligible","public_published",
   "signing_eligible","x402_chargeable"]){
    assert.equal(packet[key],false,key);
  }
  const value=JSON.stringify(packet);
  for(const forbidden of ["raw_html","telegram_session","t.me/","article_body",
   "api_hash","channel_handle","model_prompt"])assert.equal(value.includes(forbidden),false);
  const governance=readFileSync("docs/ops/TELEGRAM_HUMINT_HUMAN_ONLY_OPERATIONS_20261020.md","utf8");
  assert.match(governance,/human intelligence lead source/i);
  assert.match(governance,/human fact-checker/i);
  assert.match(governance,/authorization remains OFF/i);
  const prod=readFileSync("workers/telegram-flash/production_entrypoint.py","utf8");
  assert.match(prod,/TELEGRAM_ENABLED/);
  const cli=readFileSync("scripts/build-telegram-manual-research-review.mjs","utf8");
  assert.match(cli,/PRIVATE_CORROBORATION_REVIEW_PACKET_CREATED_NOT_PUBLISHED/);
  assert.match(cli,/writeFileSync\(output/);
});
test("Cannot inject Telegram text, AI model output or self-certify a HUMINT pointer",()=>{
  const pointer={schema:"geomacro.telegram-human-research-lead.v1",
    reference_id:"tgresearch_"+"a".repeat(32),reference_sha256:"b".repeat(64),
    category:"GEOPOLITICS",topic_code:"SANCTIONS",country_iso3:"IND",
    source_native_published_at_claimed:"2026-10-20T14:05:00Z",
    observed_at:"2026-10-20T14:10:00Z",
    historical_reference:false,source_kind:"PUBLIC_TELEGRAM_MANUALLY_VIEWED",
    reference_registered:true,human_reference_attested:true,
    source_native_time_independently_verified:false,
    automated_collection_authorized:false,has_source_message_payload:false,
    verification_status:"UNVERIFIED",editorial_status:"PENDING_INDEPENDENT_RESEARCH",
    scoring_eligible:false,commercial_eligible:false,public_published:false};
  const input={schema:"geomacro.internal-manual-corroboration-review.v1",
    human_review_requested:true,research_pointer:pointer,
    official_evidence_candidates:[]};
  for(const illegal of [
   {message_text:"raw copyrighted Telegram post"},
   {ai_generated_reasoning:"machine summary"},
   {public_published:true},
   {automated_collection_authorized:true},
  ]){
    const p={...input,research_pointer:{...pointer,...illegal}};
    assert.throws(()=>buildInternalResearchReviewPacket(p,
      new Date("2026-10-20T14:20:00Z")),/MANUAL_RESEARCH_POINTER_FIELDS_INVALID|MANUAL_RESEARCH_BOUNDARY_VIOLATION/);
  }
});
