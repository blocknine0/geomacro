import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parsePinnedMachineGroInput, verifyPinnedMachineGroBytes,
} from "../../scripts/ops/publish-qualified-machine-gro-production";

const sha = (v:Buffer) => createHash("sha256").update(v).digest("hex");
const PREFIX = "geomacro-evidence/v1/private/machine-gro-qualified/";

describe("permanent native GRO 1.1 signing and B2/D1 hot production", () => {
  it("accepts ONLY immutable exact qualified B2 SHA paths", () => {
    const hash = "a".repeat(64);
    expect(parsePinnedMachineGroInput(PREFIX + hash + ".json", hash))
      .toEqual({key:PREFIX + hash + ".json", sha256:hash});
    for (const invalid of [
      "geomacro-evidence/v1/private/other/"+hash+".json",
      PREFIX + hash + ".json/../other",
      PREFIX + hash + ".json.gz",
      PREFIX + "b".repeat(64) + ".json",
      "https://example.com/"+hash+".json",
    ]) {
      expect(() => parsePinnedMachineGroInput(invalid,hash))
        .toThrow("QUALIFIED_MACHINE_GRO_IMMUTABLE_INPUT_PIN_INVALID");
    }
    expect(() => parsePinnedMachineGroInput(PREFIX+hash+".json",hash.toUpperCase()))
      .toThrow("QUALIFIED_MACHINE_GRO_IMMUTABLE_INPUT_PIN_INVALID");
  });

  it("rejects bytes with a mismatched pin or malicious oversized input", () => {
    const bytes=Buffer.from("a".repeat(200));
    expect(() => verifyPinnedMachineGroBytes(bytes,sha(bytes))).not.toThrow();
    expect(() => verifyPinnedMachineGroBytes(bytes,"0".repeat(64)))
      .toThrow("QUALIFIED_MACHINE_GRO_INPUT_SHA256_MISMATCH");
    expect(() => verifyPinnedMachineGroBytes(Buffer.alloc(80),sha(Buffer.alloc(80))))
      .toThrow("QUALIFIED_MACHINE_GRO_INPUT_SHA256_MISMATCH");
    const oversized=Buffer.alloc(1024*1024+1);
    expect(() => verifyPinnedMachineGroBytes(oversized,sha(oversized)))
      .toThrow("QUALIFIED_MACHINE_GRO_INPUT_SHA256_MISMATCH");
  });

  it("wires exact real input -> canonical scorer + Ed25519 -> B2 full readback -> D1 hot -> live Worker", () => {
    const runtime = readFileSync("scripts/ops/publish-qualified-machine-gro-production.ts","utf8");
    const score=runtime.indexOf("acceptMachineCommercialPrivateGRO(inputPath,signedPath)");
    const publish=runtime.indexOf("promoteOwnerPrivateGRO(signedPath)");
    const verify=runtime.indexOf("readD1VerifiedHotCountryGro(");
    expect(score).toBeGreaterThan(-1);
    expect(publish).toBeGreaterThan(score);
    expect(verify).toBeGreaterThan(publish);
    expect(runtime).toContain("verifyPinnedMachineGroBytes(bytes,pinned.sha256)");
    expect(runtime).toContain("machineCommercialAuthorityConfigurationValid()");
    expect(runtime).toContain("published.b2_archive_readback_verified");
    expect(runtime).toContain("published.d1_exact_readback_verified");
    expect(runtime).toContain("hash(canonicalRiskObjectJson(hot)) !== signed.record_sha256");
    expect(runtime).toContain("rmSync(root,{recursive:true,force:true})");
    expect(runtime).toContain("payments_performed:false");
    expect(runtime).not.toContain("settleCoinbase");
    expect(runtime).not.toContain("public_hot_published:true");
  });

  it("requires genuine source rights and independent facts signatures; never self-attests", () => {
    const qualified=readFileSync("src/lib/geomacro-machine-commercial-qualification.server.ts","utf8");
    const accept=readFileSync("scripts/ops/accept-private-geomacro-machine-commercial-gro.ts","utf8");
    const publisher=readFileSync("scripts/ops/publish-private-signed-gro-d1.ts","utf8");
    expect(qualified).toContain("proofSignaturesValid(envelope)");
    expect(qualified).toContain("checkGeomacroMachineOriginalRightsPreflight");
    expect(qualified).toContain("scoreAndSignQualifiedOnDemandCountry(");
    expect(accept).toContain("prepareGeomacroMachineCommercialGRO(");
    expect(publisher).toContain("verifyRiskObjectSignature(object as any,keys)");
    expect(publisher).toContain("verifyCommercialRiskObjectArtifact(object as any");
    expect(publisher).toContain("await b2.putWithMetadataVerification(");
    expect(publisher).toContain("SELECT object_id,record_sha256,payload_hash,object_json");
    expect(publisher).not.toContain("signRiskObject(");
  });

  it("is a permanent qualified event-triggered main-only deployment, no cron, no payment or PREDGE edits", () => {
    const yaml=readFileSync(".github/workflows/permanent-qualified-signed-gro-production.yml","utf8");
    expect(yaml).toContain("repository_dispatch:");
    expect(yaml).toContain("types: [qualified_machine_gro_ready]");
    expect(yaml).toContain("workflow_dispatch:");
    expect(yaml).toContain("github.ref == 'refs/heads/main'");
    expect(yaml).toContain("environment: production");
    expect(yaml).toContain('B2_ACCOUNT_QUOTA_REQUIRED: "1"');
    expect(yaml).toContain("B2_ACCOUNT_QUOTA_WORKFLOW_ID: qualified_machine_gro_production");
    expect(yaml).toContain("scripts/ops/publish-qualified-machine-gro-production.ts");
    expect(yaml).toContain("RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64: ");
    expect(yaml).not.toContain("schedule:");
    expect(yaml).not.toContain("COINBASE_X402_MAINNET_ACK");
    expect(yaml).not.toContain("GEOMACRO_REAL_FUNDS_SECURITY_ACK");
    expect(yaml).not.toContain("PREDGE_RESEARCH_NEWS_TOKEN_OVERRIDE");
    expect(yaml).not.toContain("SUPABASE_DB_URL:");
    expect(yaml).not.toContain("upload-artifact");
  });
});
