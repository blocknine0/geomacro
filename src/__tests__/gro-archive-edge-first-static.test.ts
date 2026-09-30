import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/lib/risk-object-archive.server.ts", "utf8");

describe("GRO archive cold-read budget", () => {
  it("tries the verified B2 bridge before legacy Supabase Storage", () => {
    const edgeCall = source.indexOf("compressed = await downloadEdgeArchive(row.object_id)");
    const storageFallback = source.indexOf("compressed = await downloadLegacyStorageArchive(row.archive_key)");
    expect(edgeCall).toBeGreaterThan(-1);
    expect(storageFallback).toBeGreaterThan(edgeCall);
  });

  it("retains legacy Storage only as a fallback and keeps integrity verification", () => {
    expect(source).toContain('db.storage\n    .from("geomacro-live-intelligence")');
    expect(source).toContain('throw new Error("RISK_OBJECT_ARCHIVE_HASH_MISMATCH")');
    expect(source).toContain("verifyRiskObjectSignature(object).valid");
  });
});
