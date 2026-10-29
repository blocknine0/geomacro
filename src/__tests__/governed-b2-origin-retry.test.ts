import {readFileSync} from "node:fs";
import {describe, expect, it, vi} from "vitest";
import {withGovernedB2OriginRetry, classifyGovernedB2OriginFailure,
  retryableGovernedB2OriginFailure} from "../../workers/shared/governed-b2-origin-retry.mjs";

const fail = (code:string) => {throw new Error(code);};

describe("Phase 2: governed public B2 transient recovery", () => {
  it.each(["B2_EDGE_READ_408","B2_EDGE_READ_500","B2_EDGE_READ_502",
    "B2_EDGE_READ_503","B2_EDGE_READ_504",
    "B2_INTELLIGENCE_EDGE_TRANSPORT_UNAVAILABLE"])
  ("makes exactly one separately governed retry for %s", async code => {
    let reservations = 0;
    let distinctSigningPasses = 0;
    const pause=vi.fn(async (_ms:number)=>{});
    const bytes = await withGovernedB2OriginRetry(async () => {
      reservations++; distinctSigningPasses++;
      if (reservations === 1) fail(code);
      return new Uint8Array([1, 2, 3]);
    }, {pause});
    expect([...bytes]).toEqual([1,2,3]);
    expect(reservations).toBe(2);
    expect(distinctSigningPasses).toBe(2);
    expect(pause).toHaveBeenCalledOnce();
    expect(pause).toHaveBeenCalledWith(250);
  });

  it.each(["B2_EDGE_READ_401","B2_EDGE_READ_403","B2_EDGE_READ_404",
    "B2_EDGE_READ_429","GLOBAL_RISK_B2_SHARED_ACCOUNT_QUOTA_EXHAUSTED",
    "INTELLIGENCE_B2_SHARED_ACCOUNT_QUOTA_EXHAUSTED",
    "B2_QUOTA_D1_UNAVAILABLE","B2_EDGE_SIZE_INVALID",
    "INTELLIGENCE_EDGE_BINDING_INVALID","INTELLIGENCE_CONTINUITY_PROOF_INVALID"])
  ("rejects %s without retries, fabricated bytes or quota bypass", async code => {
    const read=vi.fn(async()=>fail(code));
    const pause=vi.fn(async()=>{});
    await expect(withGovernedB2OriginRetry(read,{pause})).rejects.toThrow(code);
    expect(read).toHaveBeenCalledOnce();
    expect(pause).not.toHaveBeenCalled();
    expect(retryableGovernedB2OriginFailure(new Error(code))).toBe(false);
  });

  it("exhausts after two failed reads without replaying stale data", async()=>{
    const read=vi.fn(async()=>fail("B2_INTELLIGENCE_EDGE_READ_503"));
    await expect(withGovernedB2OriginRetry(read,{pause:async()=>{}}))
      .rejects.toThrow("B2_INTELLIGENCE_EDGE_READ_503");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-B2 network, D1 or programming failures",async()=>{
    const read=vi.fn(async()=>{throw new TypeError("connection or D1 failure");});
    await expect(withGovernedB2OriginRetry(read)).rejects.toThrow(TypeError);
    expect(read).toHaveBeenCalledOnce();
  });

  it("reports safe, redacted failure categories, never exception detail",()=>{
    expect(classifyGovernedB2OriginFailure(new Error("B2_EDGE_READ_404")))
      .toBe("B2_OBJECT_NOT_FOUND");
    expect(classifyGovernedB2OriginFailure(new Error("B2_EDGE_READ_403")))
      .toBe("B2_FORBIDDEN_OR_PROVIDER_CAP");
    expect(classifyGovernedB2OriginFailure(new Error("B2_INTELLIGENCE_EDGE_CONFIG_REQUIRED")))
      .toBe("B2_CREDENTIAL_CONFIG_MISSING");
    expect(classifyGovernedB2OriginFailure(new Error("do-not-print-secret")))
      .toBe("VERIFIED_EVIDENCE_OR_RUNTIME_UNAVAILABLE");
  });

  it.each(["intelligence-edge","global-risk-edge"])
  ("%s signs and reserves anew INSIDE every cold GET attempt", edge=>{
    const worker=readFileSync(`workers/${edge}/src/index.mjs`,"utf8");
    expect(worker).toContain('withGovernedB2OriginRetry(() => signedGetOnce(key, env))');
    const once=worker.slice(worker.indexOf("async function signedGetOnce"),worker.indexOf("async function gunzip"));
    expect(once).toContain("reserveB2AccountQuota(env.B2_QUOTA_DB");
    expect(once.indexOf("reserveB2AccountQuota")).toBeLessThan(once.indexOf("await fetch("));
    expect(once).toContain("const timestamp = new Date().toISOString()");
    expect(once).toContain("AWS4-HMAC-SHA256 Credential=");
    expect(once).toContain("controller.abort()");
    expect(worker).toContain('classifyGovernedB2OriginFailure(error)');
    expect(worker).toContain("rememberFailedB2Origin(cache, negativeKey)");
    expect(worker).toContain("return unavailable(503)");
    expect(worker).not.toContain("stale-if-error");
  });
});
