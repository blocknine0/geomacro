import {describe,expect,it} from "node:test";
import assert from "node:assert/strict";
import {classifyCloudflareD1ReadonlyError} from "../ops/classify-cloudflare-d1-readonly-error.mjs";

describe("Cloudflare D1 read-only error classifier",()=>{
  it("distinguishes auth errors without returning raw token or stderr",()=>{
    const secret="secret-looking-token-DO-NOT-LOG";
    const r=classifyCloudflareD1ReadonlyError("Authentication error: invalid API token "+secret);
    assert.equal(r.error_class,"AUTHENTICATION_REJECTED");
    assert.equal(r.diagnostic_stderr_present,true);
    assert.equal(JSON.stringify(r).includes(secret),false);
    assert.equal(r.raw_stderr_exposed,false);
  });
  it("distinguishes missing permissions or incorrect token scope",()=>{
    assert.equal(classifyCloudflareD1ReadonlyError("Error 403: insufficient permissions to access D1").error_class,
      "PERMISSION_OR_SCOPE_DENIED");
  });
  it("distinguishes an unresolved D1 database binding",()=>{
    assert.equal(classifyCloudflareD1ReadonlyError("D1 database geomacro-control-plane not found").error_class,
      "D1_DATABASE_OR_BINDING_NOT_FOUND");
  });
  it("distinguishes rate limiting",()=>{
    assert.equal(classifyCloudflareD1ReadonlyError("HTTP 429: Too many requests").error_class,"RATE_LIMITED");
  });
  it("distinguishes upstream connectivity failures",()=>{
    assert.equal(classifyCloudflareD1ReadonlyError("fetch failed: ETIMEDOUT").error_class,
      "NETWORK_OR_UPSTREAM_UNAVAILABLE");
  });
  it("fails closed into a fixed unknown class and never echoes unexpected stderr",()=>{
    const raw="unexpected response with private account metadata";
    const r=classifyCloudflareD1ReadonlyError(raw);
    assert.equal(r.error_class,"UNKNOWN_WRANGLER_FAILURE");
    assert.equal(JSON.stringify(r).includes(raw),false);
  });
  it("does not infer health, perform any write, or accept a blank error as success",()=>{
    const r=classifyCloudflareD1ReadonlyError("");
    assert.equal(r.error_class,"UNKNOWN_WRANGLER_FAILURE");
    assert.equal(r.diagnostic_stderr_present,false);
    assert.equal(r.d1_write_performed,false);
    assert.equal(r.b2_request_performed,false);
    assert.equal(r.supabase_request_performed,false);
    assert.equal(r.payment_performed,false);
  });
});
