import {describe,it,expect} from "vitest";
import {verifiedBaselineHealth} from "./verified-baseline-health";
const allFalse={intelligence:false,global_risk:false,risk_indices:false};
describe("scoped verified baseline does not mask 503 paid health",()=>{
  it("returns 503 if none of three original baseline readbacks is verified",()=>{
    const r=verifiedBaselineHealth({
      last_verified_baseline_readable:allFalse,current_hot_product_ready:allFalse,
    });
    expect(r.statusCode).toBe(503);
    expect(r.body.qualified_for_commercial_delivery).toBe(false);
  });
  it("returns HTTP 200 with degraded proof flags for one actual baseline only",()=>{
    const r=verifiedBaselineHealth({
      last_verified_baseline_readable:{...allFalse,intelligence:true},
      current_hot_product_ready:allFalse,
    });
    expect(r.statusCode).toBe(200);
    expect(r.body.status).toBe("BASELINE_VERIFIED_LIVE_CADENCE_IN_REVIEW");
    expect(r.body.degraded).toBe(true);
    expect(r.body.current_signed_live_product_count).toBe(0);
    expect(r.body.payment_authorized).toBe(false);
    expect(r.body.legacy_paid_deep_health_path).toBe("/api/health?deep=1");
  });
  it("does not mark unsigned risk products ready from a baseline",()=>{
    const r=verifiedBaselineHealth({
      last_verified_baseline_readable:{...allFalse,intelligence:true,global_risk:true},
      current_hot_product_ready:{...allFalse,intelligence:true},
    });
    expect(r.body.current_signed_live_products.global_risk).toBe(false);
    expect(r.body.current_signed_live_products.risk_indices).toBe(false);
    expect(r.body.qualified_for_commercial_delivery).toBe(false);
  });
});
