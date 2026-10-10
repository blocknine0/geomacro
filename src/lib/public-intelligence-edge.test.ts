import { describe, expect, it } from "vitest";
import {
  canUseProductionIntelligenceBackup,
  buildVerifiedIntelligenceApiPayload,
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

  it("retains verified three-domain history but suppresses uncorroborated GDELT root-code place labels", () => {
    const rows = categories.map((c) => verified(c));
    rows.push(verified("geopolitics", {
      id: "gdelt-root-only",
      source_title: "Geomacro observes fighting in Indian Embassy, Yemen",
      summary: null, severity: null, delta: null,
      public_status: "live_observed",
    }));
    const result = parseVerifiedIntelligenceEdgePayload(payload(rows), NOW);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.category).sort()).toEqual([...categories].sort());
    expect(result.every((r) => r.public_status === "verified_b2")).toBe(true);
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

  it("suppresses current observations lacking two-source independent qualification", () => {
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
    expect(result).toHaveLength(3);
    expect(result.find((r) => r.id === "observed")).toBeUndefined();
  });

  it("serves a successful public API payload from the verified edge in preview", () => {
    const rows = parseVerifiedIntelligenceEdgePayload(payload(), NOW);
    const response = buildVerifiedIntelligenceApiPayload(rows, NOW);
    expect(response.mode).toBe("verified_b2");
    expect(response.verified_rows).toBe(3);
    expect(response.live_observed_rows).toBe(0);
    expect(response.current_within_24h).toBe(true);
    expect(response.rows.every((r) => r.public_status === "verified_b2")).toBe(true);
  });

  it("never reintroduces single-source live observations when scored domains are stale", () => {
    const rows = categories.map((c) => verified(c));
    rows.push(verified("geopolitics", {
      id: "observed",
      source_title: "Geomacro observes regional tensions near the border",
      summary: null,
      severity: null,
      delta: null,
      public_status: "live_observed",
    }));
    const projected = buildVerifiedIntelligenceApiPayload(
      parseVerifiedIntelligenceEdgePayload(payload(rows), NOW), NOW);
    expect(projected.mode).toBe("verified_b2");
    expect(projected.live_observed_rows).toBe(0);
    expect(projected.rows).toHaveLength(3);

    const olderRows = rows.map((r) => r.category === "macro"
      ? { ...r, created_at: "2026-10-06T07:00:00Z", published_at: "2026-10-06T07:00:00Z" } : r);
    const fallback = buildVerifiedIntelligenceApiPayload(
      parseVerifiedIntelligenceEdgePayload(payload(olderRows), NOW), NOW);
    expect(fallback.mode).toBe("verified_b2");
    expect(fallback.live_observed_rows).toBe(0);
  });

  it("does not relabel an old or undated event as current after a fresh B2 restore", () => {
    const archivedToday = categories.map((c) => verified(c, {
      // Current archive/rebuild timestamp is not an event publication clock.
      created_at: "2026-10-08T09:59:00Z",
      published_at: null,
    }));
    const received = parseVerifiedIntelligenceEdgePayload(payload(archivedToday), NOW);
    expect(received).toHaveLength(3); // historical verified data remains readable
    const fromEdge = buildVerifiedIntelligenceApiPayload(received, NOW);
    expect(fromEdge.current_within_24h).toBe(false);
    expect(fromEdge.newest_at).toBeNull();
    expect(fromEdge.rows).toHaveLength(3);
    expect(fromEdge.mode).toBe("verified_b2");

    const oldOriginal = categories.map((c) => verified(c, {
      created_at: "2026-10-08T09:59:00Z",
      published_at: "2026-10-04T07:00:00Z",
    }));
    const stale = buildVerifiedIntelligenceApiPayload(
      parseVerifiedIntelligenceEdgePayload(payload(oldOriginal), NOW), NOW);
    expect(stale.current_within_24h).toBe(false);
    expect(stale.newest_at).toBe("2026-10-04T07:00:00.000Z");
    expect(stale.verified_rows).toBe(3);
    expect(JSON.stringify(stale)).not.toMatch(/source_url|raw_payload|publisher_host/u);
  });

  it("rejects future-published row freshness even when archive/retrieval is current", () => {
    const rows = categories.map((c) => verified(c, {
      created_at: "2026-10-08T09:55:00Z",
      published_at: "2026-10-09T06:00:00Z",
    }));
    const response = buildVerifiedIntelligenceApiPayload(
      parseVerifiedIntelligenceEdgePayload(payload(rows), NOW), NOW);
    expect(response.current_within_24h).toBe(false);
    expect(response.newest_at).toBeNull();
  });

  it("filters unsafe editorial labels rather than showing source prose", () => {
    const rows = categories.map((c) => verified(c));
    rows[0] = verified("geopolitics", {
      source_title: "Geomacro finds The article describes a direct upstream report",
      summary: "Government controls tighten supply access",
    });
    const result = parseVerifiedIntelligenceEdgePayload(payload(rows), NOW);
    expect(result[0].source_title).toBe("Geomacro finds Government controls tighten supply access");
    expect(JSON.stringify(result)).not.toMatch(/\barticle\b/iu);
  });
});
