import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/lib/risk-object-archive.server.ts", "utf8");

describe("GRO archive cold-read budget", () => {
  it("makes direct-Postgres recovery B2-native with no Edge or Storage dependency", () => {
    const directMode = source.indexOf("if (directPostgresMode())");
    const directB2 = source.indexOf("return downloadDirectB2Archive(row)", directMode);
    const legacyEdge = source.indexOf("return await downloadEdgeArchive(row.object_id)", directB2);
    const legacyStorage = source.indexOf("return await downloadLegacyStorageArchive(row.archive_key!)", legacyEdge);

    expect(directMode).toBeGreaterThan(-1);
    expect(directB2).toBeGreaterThan(directMode);
    expect(legacyEdge).toBeGreaterThan(directB2);
    expect(legacyStorage).toBeGreaterThan(legacyEdge);
  });

  it("keeps verified direct B2 ahead of legacy Edge/Storage fallbacks outside direct mode", () => {
    const directCandidate = source.indexOf("return await downloadDirectB2Archive(row)");
    const edgeFallback = source.indexOf("return await downloadEdgeArchive(row.object_id)");
    const storageFallback = source.indexOf("return await downloadLegacyStorageArchive(row.archive_key!)");

    expect(directCandidate).toBeGreaterThan(-1);
    expect(edgeFallback).toBeGreaterThan(directCandidate);
    expect(storageFallback).toBeGreaterThan(edgeFallback);
  });

  it("retains cryptographic archive and signed-object verification", () => {
    expect(source).toContain('db.storage\n    .from("geomacro-live-intelligence")');
    expect(source).toContain('throw new Error("RISK_OBJECT_ARCHIVE_HASH_MISMATCH")');
    expect(source).toContain("RISK_OBJECT_ARCHIVE_BUNDLE_HASH_MISMATCH");
    expect(source).toContain("RISK_OBJECT_ARCHIVE_BUNDLE_MEMBER_HASH_MISMATCH");
    expect(source).toContain("verifyRiskObjectSignature(object).valid");
  });
});
