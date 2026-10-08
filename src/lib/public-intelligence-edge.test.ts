import { describe, expect, it } from "vitest";
import {
  canUseProductionIntelligenceBackup,
  parseVerifiedIntelligenceEdgePayload,
  PUBLIC_INTELLIGENCE_EDGE_URL,
} from "./public-intelligence-edge";

const NOW = Date.parse("2026-10-08T10:00:00Z");
const categories = ["geopolitics", "macro", "rare_earth"];
function verified(category: string, extras: Record<string, unknown> = {}) {
  return {
    id: `verified-${category}`,
    source_title: "Geomacro finds verified pressure affects regional operations",
    summary: "Verified policy change increases regional risk",
    category,
    severity: 70,
    delta: 4,
    created_at: "2026-10-08T07:00:00Z",
    published_at: "2026-10-08T07:00:00Z",
    public_status: "verified_b2",
    ...extras,
  };
}
function payload(rows: unknown[] = categories.map((c) => verified(c))) {
  return {
    schema: "geomacro.public-intelligence-live.v1",
    source_project: "ldpwajisioljyjtojvfx",
    generated_at: "2026-10-08T09:00:00Z",
    rows,
  };
}
describe("verified Intelligence edge-first preview recovery", () => {
  it("only trusts the pinned verified Cloudflare readback endpoint", () => {
    expect(PUBLIC_INTELLIGENCE_EDGE_URL)
      .toBe("https://geomacro-intelligence.daspallab202391.workers.dev/intelligence");
    const result = parseVerifiedIntelligenceEdgePayload(payload(), NOW);
    expect(result).toHaveLength(3);
    expect(result.every((r) => r.source_title?.startsWith("Geomacro finds "))).toBe(true);
  });

  it("keeps Lovable preview away from failing same-origin server APIs", () => {
    expect(canUseProductionIntelligenceBackup("id-preview.lovable.app")).toBe(false);
    expect(canUseProductionIntelligenceBackup("localhost")).toBe(false);
    expect(canUseProductionIntelligenceBackup("geomacro.live")).toBe(true);
    expect(canUseProductionIntelligenceBackup("www.geomacro.live")).toBe(true);
    expect(canUseProductionIntelligenceBackup("attacker.geomacro.live.example.com")).toBe(false);
  });

  it("refuses unverified, unbounded or foreign edge envelopes", () => {
    expect(() => parseVerifiedIntelligenceEdgePayload({ ...payload(), source_project: "other" }, NOW)).toThrow();
    expect(() => parseVerifiedIntelligenceEdgePayload({ ...payload(), generated_at: "2026-08-01T00:00:00Z" }, NOW)).toThrow();
    expect(() => parseVerifiedIntelligenceEdgePayload(payload([verified("macro")]), NOW)).toThrow();
    expect(() => parseVerifiedIntelligenceEdgePayload(payload(Array.from({ length: 301 }, () => verified("macro"))), NOW)).toThrow();
  });

  it("never redistributes unexpected raw fields in a purported edge row", () => {
    expect(() => parseVerifiedIntelligenceEdgePayload(payload([
      verified("geopolitics", { raw_payload: "secret text" }),
      verified("macro"),
      verified("rare_earth"),
    ]), NOW)).toThrow("unapproved fields");
  });

  it("keeps current observations unscored without inventing risk values", () => {
    const rows = categories.map((c) => verified(c));
    rows.push(verified("geopolitics", {
      id: "observed",
      source_title: "Geomacro observes regional tensions near the border",
      summary: null,
      severity: null,
      delta: null,
      public_status: "live_observed",
    }));
    const result = parseVerifiedIntelligenceEdgePayload(payload(rows), NOW);
    expect(result).toHaveLength(4);
    expect(result.find((r) => r.id === "observed")).toMatchObject({
      severity: null,
      delta: null,
      summary: null,
      public_status: "live_observed",
    });
  });

  it("filters unsafe editorial labels rather than showing source prose", () => {
    const rows = categories.map((c) => verified(c));
    rows[0] = verified("geopolitics", {
      source_title: "Geomacro finds The article describes a direct upstream report",
      summary: "Government controls tighten supply access",
    });
    const result = parseVerifiedIntelligenceEdgePayload(payload(rows), NOW);
    expect(result[0].source_title).toBe("Geomacro finds Government controls tighten supply access");
    expect(JSON.stringify(result)).not.toMatch(/\\barticle\\b/iu);
  });
});
