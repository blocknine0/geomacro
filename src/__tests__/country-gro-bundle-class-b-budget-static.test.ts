import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("country GRO bundle Class-B budget", () => {
  it("collapses a 195+ country publication to two mandatory B2 readbacks", () => {
    const publisher = read("scripts/ops/publish-b2-country-gro-continuity.ts");
    expect(publisher).toContain("b2_full_gets: 2");
    expect(publisher).toContain("gro_objects_per_bundle_get: members.length");
    expect(publisher).toContain("legacy_per_country_b2_mirrors_written: false");
    expect(publisher).toContain("full_b2_bundle_readback_verified: true");
    expect(publisher).toContain("all_member_hashes_verified: true");
    expect(publisher).toContain("all_member_signatures_verified: true");
  });

  it("reuses the exact publisher readback bytes for D1 without another B2 GET", () => {
    const sync = read("scripts/ops/sync-global-current-country-gro-to-d1.ts");
    const workflow = read(".github/workflows/b2-country-gro-continuity.yml");
    expect(sync).toContain("GLOBAL_GRO_ALLOW_LOCAL_VERIFIED_READBACK");
    expect(sync).toContain("publisher_readback_reused: reusedPublisherReadback");
    expect(sync).toContain("additional_b2_gets_for_d1_sync: b2Reads");
    expect(workflow).toContain('GLOBAL_GRO_ALLOW_LOCAL_VERIFIED_READBACK: "true"');
    expect(workflow).toContain(".publisher_readback_reused == true");
    expect(workflow).toContain(".additional_b2_gets_for_d1_sync == 0");
  });

  it("keeps preservation at two bundle reads or three legacy reads", () => {
    const preservation = read("scripts/ops/verify-b2-country-gro-preservation.ts");
    expect(preservation).toContain(
      "max_b2_gets_per_preservation_cycle: proof.schema === LEGACY_PROOF_SCHEMA ? 3 : 2",
    );
    expect(preservation).toContain('auditMode = "single-bundle-full-member-integrity"');
    expect(preservation).toContain('auditMode = "rotating-bounded-legacy-pair"');
  });

  it("indexes one content-addressed bundle pointer while retaining each member record hash", () => {
    const sync = read("scripts/ops/sync-global-current-country-gro-to-d1.ts");
    expect(sync).toContain(
      "verifyAndPushObject(member?.object, objectId, iso3, bundleKey, bundleSha, recordSha)",
    );
    expect(sync).toContain("archive_key: archiveKey");
    expect(sync).toContain("archive_sha256: archiveSha256");
    expect(sync).toContain("record_sha256: recordSha");
  });

  it("keeps runtime bundle reads single-flight and cached", () => {
    const runtime = read("src/lib/b2-country-gro.server.ts");
    expect(runtime).toContain("const CACHE_TTL_MS = 5 * 60_000");
    expect(runtime).toContain("inFlightGets.has(key)");
    expect(runtime).toContain("if (bundleState && bundleState.expiresAt > Date.now())");
    expect(runtime).toContain("if (inFlightBundle) return inFlightBundle");
  });
});
