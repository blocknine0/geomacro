import { describe, expect, it, vi } from "vitest";
import {
  fetchBoundedNoFunds,
  X402_NO_FUNDS_MAX_ATTEMPTS,
  X402_NO_FUNDS_ATTEMPT_TIMEOUT_MS,
} from "../../scripts/agentic/bounded-live-x402-no-funds-fetch.mjs";
import { readFileSync } from "node:fs";

const discovery="https://geomacro.live/.well-known/x402.json";
const availability="https://geomacro.live/api/x402/risk/availability";
const get={method:"GET",redirect:"error" as const};
const post={method:"POST",redirect:"error" as const,
  headers:{"content-type":"application/json"},body:JSON.stringify({
    schema_version:"geomacro.agent-query.v1",
    subjects:[{type:"country",country_iso3:"USA"}],
    topics:["risk_object"],evidence:"required",detail:"compact",
  }),
};

describe("#1827 bounded no-funds x402 live origin safety",()=>{
  it("retries a transient transport rejection only, never synthesizes AVAILABLE or payment",async()=>{
    const fetchImpl=vi.fn().mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(Response.json({
        availability:{deliverable:false,code:"INSUFFICIENT_COVERAGE"},
        execution_authorized:false,payment_required_now:false,
      },{status:422}));
    const sleep=vi.fn(async()=>undefined);
    const r=await fetchBoundedNoFunds(availability,post,{fetchImpl,sleep});
    expect(r.status).toBe(422);
    expect((await r.json()).availability.code).toBe("INSUFFICIENT_COVERAGE");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(500);
    for(const [,request] of fetchImpl.mock.calls) {
      expect(request.redirect).toBe("error");
      expect(request.method).toBe("POST");
      expect(request.body).toBe(post.body);
      expect(request.signal).toBeInstanceOf(AbortSignal);
    }
    expect(X402_NO_FUNDS_MAX_ATTEMPTS).toBe(2);
    expect(X402_NO_FUNDS_ATTEMPT_TIMEOUT_MS).toBe(10000);
  });

  it("never retries HTTP 422, HTTP 402, HTTP 503 or invalid response bodies",async()=>{
    for(const status of [200,402,422,503]){
      const fetchImpl=vi.fn(async()=>new Response("bad response",{status}));
      const sleep=vi.fn(async()=>undefined);
      const r=await fetchBoundedNoFunds(availability,post,{fetchImpl,sleep});
      expect(r.status).toBe(status);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    }
  });

  it("fails closed, with bounded transport attempts, when the live endpoint remains unreachable",async()=>{
    const fetchImpl=vi.fn().mockRejectedValue(new Error("network down"));
    const sleep=vi.fn(async()=>undefined);
    await expect(fetchBoundedNoFunds(discovery,get,{fetchImpl,sleep}))
      .rejects.toThrow("X402_NO_FUNDS_LIVE_ORIGIN_UNREACHABLE");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledOnce();
  });

  it("refuses any external origin, redirects, path, username, query or fake payment endpoint",async()=>{
    const fetchImpl=vi.fn(async()=>Response.json({ok:true}));
    for(const url of [
      "https://geomacro.live.evil.com/api/x402/risk/availability",
      "http://geomacro.live/api/x402/risk/availability",
      "https://geomacro.live/api/x402/settle",
      "https://geomacro.live/api/x402/risk/availability?forcePayment=true",
      "https://user@geomacro.live/api/x402/risk/availability",
      "https://geomacro.live/.well-known/geomacro-build.json",
    ]){
      await expect(fetchBoundedNoFunds(url,post,{fetchImpl}))
        .rejects.toThrow("X402_NO_FUNDS_REQUEST_BOUNDARY_INVALID");
    }
    await expect(fetchBoundedNoFunds(availability,{...post,redirect:"follow" as const},{fetchImpl}))
      .rejects.toThrow("X402_NO_FUNDS_REQUEST_BOUNDARY_INVALID");
    await expect(fetchBoundedNoFunds(discovery,post,{fetchImpl}))
      .rejects.toThrow("X402_NO_FUNDS_REQUEST_BOUNDARY_INVALID");
    await expect(fetchBoundedNoFunds(availability,get,{fetchImpl}))
      .rejects.toThrow("X402_NO_FUNDS_REQUEST_BOUNDARY_INVALID");
    await expect(fetchBoundedNoFunds(availability,{...post,body:"x".repeat(16385)},{fetchImpl}))
      .rejects.toThrow("X402_NO_FUNDS_QUERY_TOO_LARGE");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("retains all original no-charge and exact delivery acceptance conditions",()=>{
    const script=readFileSync(
      "scripts/agentic/verify-live-x402-prelaunch-availability.mjs","utf8");
    const workflow=readFileSync(".github/workflows/live-x402-prelaunch-availability.yml","utf8");
    expect(script).toContain("fetchBoundedNoFunds");
    expect(script).toContain("body.payment_required_now === false");
    expect(script).toContain("body.execution_authorized === false");
    expect(script).toContain("response.status === 422");
    expect(script).toContain("response.status === 200");
    expect(script).toContain("result.network === BASE_SEPOLIA_NETWORK");
    expect(script).toContain("if (REQUIRE_REPRESENTATIVE_AVAILABLE && !allRepresentativeAvailable)");
    expect(workflow).toContain("Verify live build marker still matches accepted deployment");
    expect(workflow).toContain("Verify live no-charge 195+ country paid-path availability");
    expect(workflow).toContain("GEOMACRO_X402_COUNTRY_CENSUS_ENFORCE:");
  });
});
