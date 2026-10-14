import {describe, expect, it} from "vitest";
import {readFileSync} from "node:fs";

describe("WDI registered signer one-shot protected preflight",()=>{
  const workflow=readFileSync(".github/workflows/wdi-registered-signer-preflight-no-funds.yml","utf8");
  const runner=readFileSync("scripts/ops/verify-wdi-protected-signer-preflight.ts","utf8");
  it("can be dispatched only on owner-approved protected main, not from PR/push",()=>{
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).not.toContain("  push:");
    expect(workflow).not.toContain("  schedule:");
    expect(workflow).toContain("github.actor == 'blocknine0'");
    expect(workflow).toContain("github.run_attempt == 1");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("I_AUTHORIZE_SINGLE_WDI_SIGNER_PREFLIGHT_NO_FUNDS");
    expect(runner).toContain("OWNER_ONE_SHOT_MAIN_DISPATCH_REQUIRED");
  });
  it("checks independent active registry rather than self-trusting private key",()=>{
    expect(runner).toContain("pinnedRiskObjectVerificationKeys");
    expect(runner).toContain('key.status!=="active"');
    expect(runner).toContain("derived!==key.public_key_spki_b64");
    expect(runner).toContain("SIGNER_MISMATCHES_INDEPENDENT_PINNED_PUBLIC_REGISTRY");
    expect(runner).toContain('priv.asymmetricKeyType!=="ed25519"');
  });
  it("checks authenticated production version and never signs or settles",()=>{
    expect(runner).toContain("17331689-14e9-4587-9f36-fa82c4e3ec08");
    expect(runner).toContain("/workers/scripts/geomacro-commerce-ledger/deployments");
    expect(runner).toContain("DEPLOYED_WORKER_CONTRACT_NOT_VERIFIED");
    expect(runner).toContain("PINNED_RIGHTS_RECEIPT_EXPIRED_GENUINE_REFRESH_REQUIRED");
    expect(runner).toContain("SOURCE2_CONSECUTIVE_ANNUAL_PAIR_UNVERIFIED");
    expect(runner).toContain("frozen_signed_customer_bytes:false");
    expect(runner).not.toContain("/v1/delivery/wdi-prequote-freeze");
    expect(workflow).not.toContain("COINBASE_X402_MAINNET_ACK");
  });
});