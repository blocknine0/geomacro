import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assessFreeSourceOperationalVerdict} from "../lib/free-source-operational-verdict.mjs";
import {PRODUCTION_FREE_UPDATE_SOURCES} from "../lib/free-source-production-updates.mjs";

const base=()=>({
 schema:"geomacro.production-free-source-updates.v1",
 d1_exact_metadata_readback_verified:true,d1_writes:3,
 b2_requests:0,supabase_requests:0,payments:0,raw_payload_persisted:false,
 configured_readers:31,attempted:2,unavailable:0,
 retained_degraded_readers:2,
 retained_degraded_source_readers:[
   {id:"iea_minerals_global",category:"rare_earth",state:"DENIED_OR_RATE_LIMIT",last_attempt_at:"2026-10-17T16:00:00.000Z"},
   {id:"wikimedia_pageviews",category:"geopolitics",state:"HTTP_UNAVAILABLE",last_attempt_at:"2026-10-17T16:00:00.000Z"},
 ],
});
test("recorded provider denials are not falsely treated as failed D1 publication",()=>{
 const status=assessFreeSourceOperationalVerdict(base());
 assert.equal(status.d1_exact_readback,"VERIFIED");
 assert.equal(status.operator_status,"PARTIAL_EXTERNAL_SOURCE_DEGRADATION");
 assert.equal(status.retained_degraded_source_count,2);
 assert.equal(status.require_source_recovery_followup,true);
 assert.equal(status.all_external_providers_healthy,false);
 assert.equal(status.current_195_country_evidence_proven,false);
 assert.equal(status.paid_product_readiness_proven,false);
});
test("newly attempted unavailable provider remains a visible degrading event",()=>{
 const receipt=base();receipt.unavailable=1;
 const result=assessFreeSourceOperationalVerdict(receipt);
 assert.equal(result.attempts_unavailable,1);
 assert.equal(result.retained_degraded_source_count,2);
 assert.equal(result.all_external_providers_healthy,false);
});
test("a clean partial poll never certifies every configured external provider",()=>{
 const receipt={...base(),retained_degraded_readers:0,retained_degraded_source_readers:[]};
 const result=assessFreeSourceOperationalVerdict(receipt);
 assert.equal(result.operator_status,"SOURCE_CHECKPOINT_HEALTHY");
 assert.equal(result.all_external_providers_healthy,false);
 receipt.attempted=receipt.configured_readers;
 assert.equal(assessFreeSourceOperationalVerdict(receipt).all_external_providers_healthy,true);
});
test("D1, signing, input bounds and privacy violations remain strictly fatal",()=>{
 const original=base();
 for(const change of [
   {d1_exact_metadata_readback_verified:false},
   {d1_writes:2},{schema:"wrong-schema"},{b2_requests:1},
   {supabase_requests:1},{payments:1},{raw_payload_persisted:true},
   {configured_readers:0},{attempted:44},{unavailable:3},
   {retained_degraded_readers:1},{retained_degraded_source_readers:null},
 ]) assert.throws(()=>assessFreeSourceOperationalVerdict({...original,...change}),
   /FREE_SOURCE_PUBLISHER_READBACK_OR_RECEIPT_INVALID/);
});
test("Wikimedia official all-agents aggregate uses complete day not unsettled prior day",()=>{
 const s=PRODUCTION_FREE_UPDATE_SOURCES.find(x=>x.id==="wikimedia_pageviews");
 assert.equal(s.category,"geopolitics");
 assert.equal(s.reader_revision,2);
 assert.equal(s.poll_minutes,1440);
 const url=new URL(s.url);
 assert.equal(url.hostname,"wikimedia.org");
 assert.equal(url.pathname.startsWith("/api/rest_v1/metrics/pageviews/aggregate/all-projects/all-access/all-agents/daily/"),true);
 const pieces=url.pathname.split("/").slice(-2);
 assert.equal(pieces.length,2);
 assert.equal(pieces[0],pieces[1]);
 const timestamp=pieces[0];
 assert.match(timestamp,/^20\d{6}00$/);
 const day=Date.UTC(+timestamp.slice(0,4),+timestamp.slice(4,6)-1,+timestamp.slice(6,8));
 const days=(Date.now()-day)/86400000;
 assert.ok(days>=1.9&&days<3.1,JSON.stringify({days}));
});
test("production GitHub writer preserves recorded failures but does not conflate them with D1 errors",()=>{
 const source=readFileSync("scripts/ops/probe-commercial-free-source-lineup.mjs","utf8");
 assert.ok(source.includes("assessFreeSourceOperationalVerdict(receipt)"));
 assert.ok(source.includes("OFFICIAL_PROVIDERS_DEGRADED"));
 assert.ok(!source.includes("if(receipt.retained_degraded_readers)process.exitCode=3"));
 assert.ok(source.includes("PRODUCTION_FREE_SOURCE_UPDATES_FAILED_CLOSED"));
});
