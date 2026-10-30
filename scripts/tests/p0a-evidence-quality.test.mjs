import test from "node:test";
import assert from "node:assert/strict";
import {p0aAuditOriginal,p0aAuditBatch} from "../lib/p0a-evidence-quality.mjs";
const make=(category,title,what,why,id)=>({
 schema:"geomacro.phase2h.private-raw-observation.v1",record_id:id,
 category,original:{original_title:title,original_published_at:"2026-10-30T09:00:00.000Z",
  original_content:null},
 analysis:{
  what_happened:{text:what,original_observation_id:id},
  why_it_matters:{text:why,independently_verified:false},
  market_relevance:{observed_market_reaction_verified:false,
   confirmed_instruments:[],price_direction:null,price_change:null},
  what_to_watch:{confirmed_followup_at:null,event_topic:"topic",
    trigger:"NEXT_ORIGINAL_RELEASE_OR_INDEPENDENT_CONFIRMATION"},
  evidence_and_confidence:{original_observation_id:id,
   source_published_at:"2026-10-30T09:00:00.000Z",
   original_article_page_verified:false,paid_eligible:false,
   independent_event_verified:false}
 }});
const events=[
 make("geopolitics","Agency extends restrictions on lithium exports",
  "Agency extends restrictions on lithium exports.",
  "The restrictions on lithium exports introduce a compliance-monitoring question; no actual shipment disruption has been verified.","a".repeat(64)),
 make("macro","Central bank holds benchmark interest rate at 5.25%",
  "Central bank holds benchmark interest rate at 5.25%.",
  "The unchanged benchmark interest rate at 5.25% is the policy fact; no observed currency reaction is established.","b".repeat(64)),
 make("rare_earth","Government announces cobalt refinery grant programme",
  "Government announces cobalt refinery grant programme.",
  "The cobalt refinery grant programme is an announced financing measure, not evidence of new operating capacity.","c".repeat(64))
];
test("genuine event anchors in all three domains pass without inventing markets",()=>{
 for(const item of events)assert.deepEqual(p0aAuditOriginal(item).reasons,[]);
 const batch=p0aAuditBatch(events);
 assert.equal(batch.all_three_with_source_grounded_pass,true);
 assert.equal(batch.no_unsupported_claims,true);
 assert.equal(Object.values(batch.counts).reduce((sum,x)=>sum+x.pass,0),3);
});
test("unknown cause stays null rather than being filled with category boilerplate",()=>{
 const e=structuredClone(events[0]);e.analysis.why_it_matters.text=null;
 const result=p0aAuditOriginal(e);
 assert.equal(result.status,"EVIDENCE_LIMITED");
 assert.ok(result.reasons.includes("WHY_MISSING"));
 const batch=p0aAuditBatch([e]);
 assert.equal(batch.counts.geopolitics.limited,1);
 assert.equal(batch.counts.geopolitics.reject,0);
 assert.equal(Object.hasOwn(batch.counts.geopolitics,"evidence_limited"),false);
});
test("generic analysis, ungrounded facts and repeated why fail closed",()=>{
 const boilerplate=structuredClone(events[1]);
 boilerplate.analysis.why_it_matters.text="A dated first-party source item was observed.";
 assert.equal(p0aAuditOriginal(boilerplate).status,"REJECT");
 const falseNumber=structuredClone(events[1]);
 falseNumber.analysis.why_it_matters.text="The benchmark rate increased 50 basis points, contrary to the statement.";
 assert.ok(p0aAuditOriginal(falseNumber).reasons.includes("UNSOURCED_QUANTITATIVE_CLAIM"));
 const market=structuredClone(events[2]);
 market.analysis.market_relevance.price_direction="up";
 assert.ok(p0aAuditOriginal(market).reasons.includes("UNVERIFIED_MARKET_CLAIM"));
 const repeated=structuredClone(events[0]);
 repeated.record_id="d".repeat(64);
 repeated.analysis.evidence_and_confidence.original_observation_id=repeated.record_id;
 const batch=p0aAuditBatch([events[0],repeated]);
 assert.equal(batch.issue_counts.REPEATED_IDENTICAL_WHY_ACROSS_ORIGINALS,1);
});
test("unrelated template is not an event-specific consequence",()=>{
 const unrelated=structuredClone(events[0]);
 unrelated.analysis.why_it_matters.text="Global conditions may influence trading and the broader economy.";
 const r=p0aAuditOriginal(unrelated);
 assert.equal(r.status,"REJECT");
 assert.ok(r.reasons.includes("WHY_LACKS_EVENT_ANCHORS"));
});
