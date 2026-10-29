import {test,expect} from "bun:test";
import {buildCanonical195x3CoverageMatrix} from "../../src/lib/canonical-195-country-coverage-matrix";
import {assertGlobalAuditDocument,buildGlobalAuditSnapshot,assertProofHead,
  verifyPreviousSnapshot,digest,GLOBAL_PROOF_HEAD_KEY} from "../lib/195x3-durable-proof-chain.mjs";
import {archiveGlobalCountryAudit,classifyGlobalProofArchiveFailure} from "../ops/archive-195x3-global-readiness-proof.mjs";

const when="2026-10-29T12:00:00.000Z";
const clock="2026-10-29T12:00:12.000Z";
const SHA40="a".repeat(40);
const makeAudit=(ok=true)=>({
 schema:"geomacro.supabase-free-country-runtime-audit.v1",
 checked_at:when, country_registry_version:"geomacro.un193-plus-two-observers.iso3.v1",
 country_count:195,category_count:3,routing_cell_count:585,
 audit_state:ok?"GLOBAL_RUNTIME_READ_VERIFIED":"SOURCE_RUNTIME_UNAVAILABLE",
 audit_ok:ok,
 source_runtime:ok?{schema:"test.stub.no-data",contexts:[{},{},{}]}:null,
 automated_finds_categories:ok?[{category:"geopolitics"},{category:"macro"},{category:"rare_earth"}]:[],
 country_current_evidence_not_inferred_from_global_feeds:true,
 current_signed_country_delivery_verified_count:0,
 paid_country_readiness_assessed:false,independent_reviewed_products_recovered:false,
 blocked_scope:ok?undefined:"GLOBAL_SOURCE_READ_NOT_PER_COUNTRY_NEGATIVE_PROOF",
 boundaries:{supabase_requests:0,b2_requests:0,payments:0,
   raw_source_urls_emitted:false,raw_source_material_emitted:false,
   execution_authorized:false},
 country_category_matrix:buildCanonical195x3CoverageMatrix(),
});
const ENV={
 GITHUB_REPOSITORY:"blocknine0/geomacro",
 GITHUB_REF:"refs/heads/main",
 GITHUB_SHA:SHA40,GITHUB_RUN_ID:"123456",GITHUB_RUN_ATTEMPT:"1",
 B2_ACCOUNT_QUOTA_REQUIRED:"1",B2_ACCOUNT_QUOTA_WORKFLOW_ID:"global_195_audit",
 D1_DATABASE_ID:"db-dummy",CLOUDFLARE_ACCOUNT_ID:"account-dummy",
 CLOUDFLARE_API_TOKEN:"dummy-not-real",B2_KEY_ID:"write-dummy",
 B2_APPLICATION_KEY:"write-secret-not-real",
 B2_ARCHIVE_READ_KEY_ID:"read-dummy",
 B2_ARCHIVE_READ_APPLICATION_KEY:"read-secret-not-real",
};
function memoryStore(){
 const data=new Map(),calls=[];
 return{
  data,calls,
  async getOptional(k){calls.push(["optional",k]);return data.get(k)??null;},
  async get(k){calls.push(["get",k]);if(!data.has(k))throw Error("NOT_FOUND");return data.get(k);},
  async putWithMetadataVerification(k,b){
    calls.push(["put_readback",k]); data.set(k,Buffer.from(b));
    return{sha256:digest(b),bytes:b.length,full_body_readback_verified:true};
  },
 };
}
test("exact 585 unknown cells never infer current news/paid delivery",()=>{
 const doc=makeAudit();
 const v=assertGlobalAuditDocument(doc);
 expect(v.covered_lanes).toBe(585);
 expect(v.observed_current_cells).toBe(0);
 expect(v.observed_signed_customer_cells).toBe(0);
 const blocked=makeAudit(false);
 expect(assertGlobalAuditDocument(blocked).audit_ok).toBe(false);
 expect(blocked.country_category_matrix.cells.filter(x=>x.CURRENT_EVIDENCE_AVAILABLE===null).length).toBe(585);
});
test("failed source still creates append-only historical proof but remains RED",()=>{
 const audit=makeAudit(false);
 const d=buildGlobalAuditSnapshot({
   audit,gitCommit:SHA40,runId:"123456",runAttempt:"1",
   recordedAt:clock,previousHead:null,
 });
 expect(d.head.audit_ok).toBe(false);
 expect(d.head.live_data_eligibility_implied).toBe(false);
 expect(d.bytes.length).toBeGreaterThan(1000);
 expect(verifyPreviousSnapshot(d.head,d.bytes)).toBe(true);
 expect(()=>verifyPreviousSnapshot(d.head,Buffer.from("tampered"))).toThrow();
});
test("all snapshots preserved; previous B2 hash + bytes are independently read back",async()=>{
 const b2=memoryStore();
 const opts={env:ENV,b2,now:new Date(clock)};
 const first=await archiveGlobalCountryAudit({audit:makeAudit(false),...opts});
 expect(first.provider_snapshot_audit_ok).toBe(false);
 expect(first.archive_full_readback_verified).toBe(true);
 expect(b2.data.has(first.archived_snapshot)).toBe(true);
 expect(b2.data.has(GLOBAL_PROOF_HEAD_KEY)).toBe(true);
 const updatedEnv={...ENV,GITHUB_RUN_ID:"123457"};
 const next=await archiveGlobalCountryAudit({
   audit:makeAudit(true),env:updatedEnv,b2,
   now:new Date("2026-10-29T12:00:22.000Z"),
 });
 expect(next.provider_snapshot_audit_ok).toBe(true);
 expect(next.previous_snapshot).toBe(first.archived_snapshot);
 expect(b2.data.has(first.archived_snapshot)).toBe(true);
 expect(b2.data.has(next.archived_snapshot)).toBe(true);
 expect(b2.calls.some(([op,key])=>op==="get"&&key===first.archived_snapshot)).toBe(true);
});
test("tampered old historical B2 snapshot blocks next pointer advance",async()=>{
 const b2=memoryStore();
 const first=await archiveGlobalCountryAudit({
   audit:makeAudit(true),env:ENV,b2,now:new Date(clock),
 });
 b2.data.set(first.archived_snapshot,Buffer.from("TAMPERED"));
 const oldHead=Buffer.from(b2.data.get(GLOBAL_PROOF_HEAD_KEY));
 await expect(archiveGlobalCountryAudit({
    audit:makeAudit(false),env:{...ENV,GITHUB_RUN_ID:"123457"},b2,
    now:new Date("2026-10-29T12:00:22.000Z"),
 })).rejects.toThrow();
 expect(Buffer.from(b2.data.get(GLOBAL_PROOF_HEAD_KEY)).equals(oldHead)).toBe(true);
});
test("no main branch/governor/independent-read credential => no archive",async()=>{
 const b2=memoryStore();
 await expect(archiveGlobalCountryAudit({
   audit:makeAudit(true),env:{...ENV,GITHUB_REF:"refs/heads/feature"},b2,now:new Date(clock),
 })).rejects.toThrow();
 await expect(archiveGlobalCountryAudit({
   audit:makeAudit(true),env:{...ENV,B2_ARCHIVE_READ_KEY_ID:ENV.B2_KEY_ID},b2,now:new Date(clock),
 })).rejects.toThrow();
 expect(b2.data.size).toBe(0);
});
test("false paid delivery or invented positive evidence is rejected",()=>{
 const fake=makeAudit();
 fake.country_category_matrix.cells[0].SIGNED_DELIVERY_VERIFIED=true;
 expect(()=>assertGlobalAuditDocument(fake)).toThrow();
 const bad=makeAudit(false);
 bad.source_runtime={contexts:[]};
 expect(()=>assertGlobalAuditDocument(bad)).toThrow();
});


test("last successful source proof remains pinned across repeated outage days",async()=>{
 const b2=memoryStore();
 const healthy=await archiveGlobalCountryAudit({
   audit:makeAudit(true),env:ENV,b2,now:new Date(clock),
 });
 const afterOne=await archiveGlobalCountryAudit({
   audit:makeAudit(false),env:{...ENV,GITHUB_RUN_ID:"123457"},b2,
   now:new Date("2026-10-29T12:00:22.000Z"),
 });
 const afterTwo=await archiveGlobalCountryAudit({
   audit:makeAudit(false),env:{...ENV,GITHUB_RUN_ID:"123458"},b2,
   now:new Date("2026-10-29T12:00:32.000Z"),
 });
 const head=assertProofHead(JSON.parse(b2.data.get(GLOBAL_PROOF_HEAD_KEY).toString("utf8")));
 expect(head.snapshot_key).toBe(afterTwo.archived_snapshot);
 expect(head.last_success_snapshot_key).toBe(healthy.archived_snapshot);
 expect(head.last_success_snapshot_sha256).toBe(healthy.sha256);
 expect(head.last_success_reference_only).toBe(true);
 expect(b2.data.has(healthy.archived_snapshot)).toBe(true);
 expect(b2.data.has(afterOne.archived_snapshot)).toBe(true);
 expect(b2.data.has(afterTwo.archived_snapshot)).toBe(true);
 expect(head.live_data_eligibility_implied).toBe(false);
});

test("archive failures disclose only safe class, never credential/endpoint contents",()=>{
 expect(classifyGlobalProofArchiveFailure(
   Error("B2_ACCOUNT_GLOBAL_QUOTA_D1_RESERVATION_FAILED")))
   .toBe("GLOBAL_PROOF_PUBLISH_D1_ACCOUNT_GOVERNOR_UNAVAILABLE");
 expect(classifyGlobalProofArchiveFailure(Error("B2_GLOBAL_DAILY_QUOTA_EXHAUSTED")))
   .toBe("GLOBAL_PROOF_PUBLISH_B2_SHARED_QUOTA_HELD");
 expect(classifyGlobalProofArchiveFailure(Error("B2_GET_FAILED_403_AccessDenied_secret")))
   .toBe("GLOBAL_PROOF_PUBLISH_B2_ACCESS_DENIED");
 const text="response includes private-token-should-not-appear";
 expect(classifyGlobalProofArchiveFailure(Error(text))).not.toContain(text);
});
