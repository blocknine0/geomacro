import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { classifySignedGroLiveBridge } from "../../scripts/lib/signed-gro-live-bridge-evidence.mjs";

const backend = {
  ok:true, serving_store:"cloudflare-d1", signature_valid:true,
  commercial_eligibility_verified:true,
  external_payment_performed:false, execution_authorized:false,
  country_iso3:"USA",
};
function site(code = "INSUFFICIENT_COVERAGE", missing = ["signed_risk_object"]) {
  return {
    payment_required_now:false, execution_authorized:false,
    query_plan_hash:"a".repeat(64),
    availability:{deliverable:false,code,missing_modules:missing},
  };
}
describe("#1827 signed GRO backend vs public website one-country no-charge bridge", () => {
  it("does NOT conflate 96 hot GROs with any live deliverability when the signed GRO module is absent", () => {
    const result = classifySignedGroLiveBridge({ backendCanary:backend, status:422, body:site() });
    expect(result.outcome).toBe("BACKEND_VERIFIED_SITE_SIGNED_GRO_MISSING");
    expect(result.backend_d1_signed_gro_verified).toBe(true);
    expect(result.site_deliverable).toBe(false);
    expect(result.site_missing_modules).toEqual(["signed_risk_object"]);
    expect(JSON.stringify(result)).not.toContain("Bearer");
    expect(JSON.stringify(result)).not.toContain("token_value");
    expect(result.site_secret_config).toBe("NOT_OBSERVABLE_FROM_GITHUB");
  });
  it("does not confuse missing other modules with a signed GRO site mismatch", () => {
    const result = classifySignedGroLiveBridge({
      backendCanary:backend, status:422, body:site("STALE_REQUIRED_DATA",["external_fx","uncensored-url"]),
    });
    expect(result.outcome).toBe("BACKEND_VERIFIED_SITE_OTHER_MODULE_UNAVAILABLE");
    expect(result.site_missing_modules).toEqual(["external_fx"]);
  });
  it("requires verified signed D1 hot backend before diagnosing the website", () => {
    for (const modified of [
      {ok:false}, {signature_valid:false}, {commercial_eligibility_verified:false},
      {external_payment_performed:true}, {execution_authorized:true},
      {country_iso3:"CHN"},
    ]) expect(() => classifySignedGroLiveBridge({
      backendCanary:{...backend,...modified},status:422,body:site(),
    })).toThrow("SIGNED_GRO_BACKEND_CANARY_NOT_VERIFIED");
  });
  it("fails closed on 402, arbitrary 200, fraudulent AVAILABLE, invalid hash or any payment authorization", () => {
    const valid = site();
    const inputs = [
      {status:402,body:valid},
      {status:200,body:valid},
      {status:200,body:{
        ...valid,
        availability:{deliverable:true,code:"AVAILABLE"},
        exact_price:{network:"eip155:8453"},
      }},
      {status:422,body:{...valid,payment_required_now:true}},
      {status:422,body:{...valid,execution_authorized:true}},
      {status:422,body:{...valid,query_plan_hash:"none"}},
      {status:422,body:{...valid,availability:{deliverable:false,code:"SOMETHING_ELSE"}}},
    ];
    for (const input of inputs)expect(() => classifySignedGroLiveBridge({
      backendCanary:backend,...input,
    })).toThrow(/BRIDGE_/);
  });
  it("accepts only TESTNET/no-charge logical availability without equating it to actual mainnet launch", () => {
    const result = classifySignedGroLiveBridge({
      backendCanary:backend,status:200,
      body:{
        ...site(),
        availability:{deliverable:true,code:"AVAILABLE"},
        exact_price:{network:"eip155:84532"},
      },
    });
    expect(result.outcome).toBe("LIVE_TESTNET_NO_CHARGE_AVAILABLE");
    expect(result.action).toBe("MAINNET_AND_GLOBAL_COVERAGE_STILL_UNVERIFIED");
  });
  it("keeps the canary single-shot, no secret or raw object uploads, and no payment calls", () => {
    const workflow = readFileSync(".github/workflows/live-signed-gro-bridge-proof.yml","utf8");
    const script = readFileSync("scripts/ops/verify-signed-gro-live-bridge.mjs","utf8");
    expect(workflow).toContain("Merge #1848");
    expect(workflow).toContain("verify-country-gro-hot-serving.ts");
    expect(workflow).toContain("GEOMACRO_COMMERCE_LEDGER_TOKEN:");
    expect(workflow).toContain("scripts/ops/verify-signed-gro-live-bridge.mjs");
    expect(workflow).toContain("bridge-evidence.json");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).not.toContain("B2_KEY_ID:");
    expect(workflow).not.toContain("SUPABASE_DB_URL:");
    expect(script).toContain("/api/x402/risk/availability");
    expect(script).toContain("topics: [\"risk_object\"]");
    expect(script).toContain("process.exitCode = 3");
    expect(script).not.toContain("/api/x402/risk/purchase");
  });
});
