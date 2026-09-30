import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const wrapper = readFileSync("scripts/ops/b2-archive-gro-retired-keys.ts", "utf8");
const workflow = readFileSync(".github/workflows/b2-gro-bundle-first-batch.yml", "utf8");

describe("GRO retired signing-key cold archive", () => {
  it("reuses the verified bundle worker for retired published keys and excludes revoked keys", () => {
    expect(wrapper).toContain('key.status === "retired"');
    expect(wrapper).toContain('RISK_OBJECT_SIGNING_KEY_ID: keyId');
    expect(wrapper).toContain('"scripts/ops/b2-archive-gro-bundle.ts"');
    expect(wrapper).toContain("revoked_keys_excluded: true");
    expect(wrapper).not.toContain('key.status === "revoked"');
  });

  it("keeps retired-key draining serialized behind the active-key verified archive step", () => {
    expect(workflow).toContain("max-parallel: 1");
    expect(workflow).toContain('GRO_BUNDLE_LIMIT: "25"');
    expect(workflow).toContain('GRO_RETIRED_KEY_ROUNDS: "4"');
    expect(workflow.indexOf("Archive verified expired signed GRO payloads"))
      .toBeLessThan(workflow.indexOf("Archive verified GRO payloads signed by retired keys"));
  });
});
