import {afterEach,describe,expect,it,vi} from "vitest";

// Simulates the known frozen Supabase abuse-control store. This must never
// allow canonical mainnet payment POST; only the no-funds buyer preflight.
vi.mock("../lib/risk-supabase.server",()=>({
  requireRiskSupabase:()=>{throw Error("TEST_SUPABASE_QUOTA_FROZEN");},
}));
import {
  classifyCentralSecurityRoute,enforceCentralRequestSecurity,
} from "../lib/central-security.server";
import {preflightStructuralBaseline} from "../lib/earn-first-structural-offers.server";

const pepper=process.env.GEOMACRO_SECURITY_FINGERPRINT_PEPPER;
afterEach(()=>{
  if(pepper===undefined)delete process.env.GEOMACRO_SECURITY_FINGERPRINT_PEPPER;
  else process.env.GEOMACRO_SECURITY_FINGERPRINT_PEPPER=pepper;
});

describe("no-Supabase buyer preflight, canonical x402 still fail closed",()=>{
  it("only classifies the precise no-charge availability methods as public_api",()=>{
    for(const method of ["GET","POST","OPTIONS"])
      expect(classifyCentralSecurityRoute(
        "/api/v1/intelligence/availability",method)).toBe("public_api");
    for(const method of ["POST","OPTIONS"])
      for(const paid of [
        "/api/v1/intelligence/query",
        "/api/v1/intelligence/geopolitics",
        "/api/v1/intelligence/macro-fx",
        "/api/v1/intelligence/critical-minerals",
        "/api/x402/risk",
      ])
        expect(classifyCentralSecurityRoute(paid,method)).toBe("payment");
    expect(classifyCentralSecurityRoute(
      "/api/v1/intelligence/availability-extra","POST")).toBe("api_write");
  });

  it("permits bounded no-funds availability read under frozen Supabase, never payment",async()=>{
    process.env.GEOMACRO_SECURITY_FINGERPRINT_PEPPER="p".repeat(64);
    const requestHeaders=new Headers({"content-type":"application/json",
      "cf-connecting-ip":"203.0.113.201"});
    const allowed=await enforceCentralRequestSecurity({
      pathname:"/api/v1/intelligence/availability",
      method:"POST",headers:requestHeaders,
    });
    expect(allowed).toMatchObject({allowed:true,status:200,
      code:"CENTRAL_SECURITY_LOCAL_DEGRADED_PASS",routeClass:"public_api"});

    const paid=await enforceCentralRequestSecurity({
      pathname:"/api/v1/intelligence/query",
      method:"POST",headers:requestHeaders,
    });
    expect(paid.allowed).toBe(false);
    expect(paid.status).toBe(503);
    expect(paid.routeClass).toBe("payment");
  });

  it("keeps no-funds request body cap and payment signature rejection in the handler",async()=>{
    const body={delivery_tier:"structural_baseline",fulfillment_mode:"published_only",
      topics:["macro_risk"],subjects:[{type:"country",country_iso3:"USA"}]};
    const verify=vi.fn();
    const req=(headers:Record<string,string>,payload:unknown=body)=>
      new Request("https://geomacro.live/api/v1/intelligence/availability",{
        method:"POST",headers:{"content-type":"application/json",...headers},
        body:JSON.stringify(payload),
      });
    const payment=await preflightStructuralBaseline(req({
      "payment-signature":"MUST_NEVER_BE_CHARGED",
    }),{check:verify,rateLimit:()=>true});
    expect(payment.status).toBe(400);
    expect(await payment.json()).toMatchObject({
      chargeable:false,payment_required_now:false,execution_authorized:false,
      error:{code:"PREFLIGHT_PAYMENT_NOT_ACCEPTED"},
    });
    const denied=await preflightStructuralBaseline(req({}),{
      check:verify,rateLimit:()=>false,
    });
    expect(denied.status).toBe(429);
    expect((await denied.json()).chargeable).toBe(false);
    const oversize=await preflightStructuralBaseline(req({
      "content-length":"9000",
    }),{check:verify,rateLimit:()=>true});
    expect(oversize.status).toBe(413);
    expect(verify).not.toHaveBeenCalled();
  });
});
