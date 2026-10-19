import {describe,it,expect,vi} from "vitest";
import {readFileSync} from "node:fs";
import {inspectGriHistoryCandidateMetadata,phase2GriAdmission}
  from "../../scripts/ops/preflight-phase2-reviewed-history.mjs";
const NOW=new Date("2026-10-19T08:00:00.000Z");
function row(ts:string,hashChar="a"){
  return {source_as_of:ts,b2_sha256:hashChar.repeat(64),
    payload_sha256:(hashChar==="a"?"b":"c").repeat(64),
    original_generated_at:new Date(Date.parse(ts)+5*60_000).toISOString(),
    original_verified_at:new Date(Date.parse(ts)+7*60_000).toISOString(),
    proof_schema:"geomacro.public-global-risk-live-proof.v1"};
}
const first=row("2026-10-08T06:30:00.000Z");
const second=row("2026-10-07T06:30:00.000Z","c");
const env={
  B2_ACCOUNT_QUOTA_REQUIRED:"1",
  B2_ACCOUNT_QUOTA_WORKFLOW_ID:"historical_gri_version_recovery",
  GEOMACRO_GRI_RESTORE_WEBSITE_HISTORY:"1",
};
describe("Phase2 historical source vs signed-current distinction",()=>{
 it("reuses one actual historical D1 row without claiming 2 snapshot score lineage",async()=>{
   const read=vi.fn(async(sql:string,params:unknown[])=>{
     expect(sql).not.toContain("payload_json");
     expect(sql).toContain("LIMIT 8");
     expect(params).toEqual([]);
     return [first];
   });
   const receipt=await phase2GriAdmission({query:read,env,now:NOW});
   expect(receipt.historical.distinct_historical_website_snapshot_candidates).toBe(1);
   expect(receipt.historical.two_historical_d1_candidates_observed).toBe(false);
   expect(receipt.historical.multi_snapshot_immutable_b2_history_bytes_verified).toBe(false);
   expect(receipt.missing_signed_input_requirements).toContain(
     "REAL_INDEPENDENTLY_REVIEWER_SIGNED_GRI_INPUT");
   expect(receipt.next_phase).toBe("VERIFY_IMMUTABLE_MULTI_SNAPSHOT_B2_HISTORY_AND_DISTINCT_ORIGINALS");
   expect(receipt.b2_requests).toBe(0);
   expect(receipt.signed_gri_now_verified).toBe(false);
 });
 it("two distinct historical D1 metadata candidates STILL are not actual B2 history proof",()=>{
   const data=inspectGriHistoryCandidateMetadata([first,second],{now:NOW});
   expect(data.two_historical_d1_candidates_observed).toBe(true);
   expect(data.multi_snapshot_immutable_b2_history_bytes_verified).toBe(false);
   expect(data.paid_gri_or_indices_published).toBe(false);
 });
 it("contradictory original-source identities and unsupported proof fail closed",()=>{
   const conflicting={...first,b2_sha256:"d".repeat(64)};
   const x=inspectGriHistoryCandidateMetadata([first,conflicting,second],{now:NOW});
   expect(x.historical_metadata_conflicts).toBe(1);
   expect(x.two_historical_d1_candidates_observed).toBe(false);
   const forgery=inspectGriHistoryCandidateMetadata([
     {...first,proof_schema:"not-genuine"},second],{now:NOW});
   expect(forgery.distinct_historical_website_snapshot_candidates).toBe(1);
   expect(forgery.two_historical_d1_candidates_observed).toBe(false);
 });
 it("valid metadata + current SHA hint still cannot sign or authorize settlement",async()=>{
   const response=await phase2GriAdmission({env:{
     ...env,GRI_READY_REVIEWED_SHA256:"a".repeat(64),
     GRI_READY_CERTIFICATES_SHA256:"b".repeat(64),
     GRI_READY_APPROVED_AT:"2026-10-19T07:55:00.000Z",
   },now:NOW,query:async()=>[first,second]});
   expect(response.externally_approved_current_review_hint_valid).toBe(true);
   expect(response.historical.multi_snapshot_immutable_b2_history_bytes_verified).toBe(false);
   expect(response.next_phase).toBe("PROTECTED_PUBLISHER_MUST_REVALIDATE_SIGNATURES_RIGHTS_B2_BYTES");
   expect(response.signed_gri_now_verified).toBe(false);
   expect(response.payments).toBe(0);
 });
 it("requires no B2, no Supabase, no payment and no private raw JSON",async()=>{
   for(const patch of [{SUPABASE_URL:"http://private.invalid"},
     {B2_ACCOUNT_QUOTA_REQUIRED:"0"},{COINBASE_API_KEY:"never"}]){
     const fetch=vi.fn();
     await expect(phase2GriAdmission({env:{...env,...patch},now:NOW,
       query:fetch})).rejects.toThrow();
     expect(fetch).not.toHaveBeenCalled();
   }
   const wf=readFileSync(".github/workflows/gri-pinned-version-recovery.yml","utf8");
   expect(wf).toContain("Phase2 historical multi-snapshot and signed approval read-only admission");
   expect(wf).toContain("preflight-phase2-reviewed-history.mjs");
   expect(wf).not.toContain("secrets.GRI_READY");
 });
});
