import {describe,it,expect} from "vitest";
import {projectP0HotQuotaDecision,p0QuotaSummary}
  from "../../scripts/ops/print-p0-hot503-quota-decision.mjs";
const base={
 schema:"geomacro.b2-account-ledger-readonly.v1",
 ledger_observed:true,provider_account_usage_verified:false,
 b2_requests:0,d1_writes:0,payment_performed:false,
 remaining_reserved_total_headroom:53,
 remaining_reserved_get_headroom:0,
 quota_allows_full_hot_audit:false,
 quota_hold_reason:"SHARED_DAILY_GET_HEADROOM_HELD"
};
describe("P0 hot-503 zero-B2 quota decision reporting",()=>{
 it("shows real D1 GET cap exhaustion, not fake current product recovery",()=>{
   const p=projectP0HotQuotaDecision(base);
   expect(p.ledger_observed).toBe(true);
   expect(p.reserved_get_headroom).toBe(0);
   expect(p.reserved_total_headroom).toBe(53);
   expect(p.current_hot_eight_get_headroom_present).toBe(false);
   expect(p.hold_reason).toBe("SHARED_DAILY_GET_HEADROOM_HELD");
   expect(p.data_signed_or_restored).toBe(false);
   expect(p.b2_network_requests).toBe(0);
   expect(p0QuotaSummary(p)).toContain("Remaining GET reservations | 0");
 });
 it("accepts quota headroom without pretending B2 provider usage was audited",()=>{
   const p=projectP0HotQuotaDecision({...base,
     remaining_reserved_get_headroom:10,
     remaining_reserved_total_headroom:19,
     quota_allows_full_hot_audit:true,
     quota_hold_reason:null});
   expect(p.current_hot_eight_get_headroom_present).toBe(true);
   expect(p.provider_account_usage_verified).toBe(false);
   expect(p.hold_reason).toBeNull();
 });
 it("fails closed on invalid receipts and forgeries",()=>{
   for(const body of [null,{...base,schema:"evil"},{...base,b2_requests:1},
     {...base,d1_writes:1},{...base,provider_account_usage_verified:true},
     {...base,payment_performed:true}])
     expect(()=>projectP0HotQuotaDecision(body)).toThrow();
 });
 it("does not infer headroom from an absent day ledger",()=>{
   const p=projectP0HotQuotaDecision({...base,ledger_observed:false,
     remaining_reserved_get_headroom:null,remaining_reserved_total_headroom:null,
     quota_hold_reason:"ACCOUNT_LEDGER_NOT_OBSERVED"});
   expect(p.current_hot_eight_get_headroom_present).toBe(false);
   expect(p.reserved_get_headroom).toBeNull();
 });
});
