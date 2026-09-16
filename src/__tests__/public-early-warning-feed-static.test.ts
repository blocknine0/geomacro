import fs from "node:fs";
import { describe, expect, it } from "vitest";

const service = fs.readFileSync(
  "src/lib/public-early-warning-feed.server.ts",
  "utf8",
);
const route = fs.readFileSync(
  "src/routes/api.early-warning.ts",
  "utf8",
);

describe("public Early Warning feed static contract", () => {
  it("queries only already-published, public-eligible Early Warning rows", () => {
    expect(service).toContain('.from("early_warning_alerts")');
    expect(service).toContain('.eq("visibility", "public")');
    expect(service).toContain('.eq("public_eligible", true)');
    expect(service).toContain('.eq("content_type", "early_warning")');
    expect(service).toContain('.eq("methodology_calibrated", false)');
    expect(service).toContain('.not("published_at_utc", "is", null)');
    expect(service).toContain('.in("status", ["WARNING", "CRITICAL"])');
  });

  it("does not select raw evidence, source identities or CEWS internals", () => {
    const selectStart = service.indexOf('.select(\n      "schema_version');
    const selectEnd = service.indexOf('\n    )\n    .eq("visibility"', selectStart);
    expect(selectStart).toBeGreaterThan(-1);
    expect(selectEnd).toBeGreaterThan(selectStart);
    const selected = service.slice(selectStart, selectEnd);

    for (const forbidden of [
      "evidence_refs",
      "source_event_ids",
      "source_risk_object_id",
      "first_source_seen_at_utc",
      "cews_inputs",
      "cews_contributions",
      "outcome_status",
      "outcome_summary",
      "outcome_evidence_refs",
    ]) {
      expect(selected).not.toContain(forbidden);
    }
  });

  it("keeps public output informational and non-trading", () => {
    expect(service).toContain("structural_pressure_only: true");
    expect(service).toContain("market_price_prediction: false");
    expect(service).toContain("trading_instruction: false");
    expect(service).toContain("public_performance_claims_allowed: false");
    expect(route).toContain("performance_claim: false");
  });

  it("exposes a read-only route with bounded caching and opaque failures", () => {
    expect(route).toContain('createFileRoute("/api/early-warning")');
    expect(route).toContain("OPTIONS: async");
    expect(route).toContain("GET: async");
    expect(route).not.toContain("POST: async");
    expect(route).not.toContain("PUT: async");
    expect(route).not.toContain("DELETE: async");
    expect(route).toContain("public, max-age=15, s-maxage=30, stale-while-revalidate=60");
    expect(route).toContain('"Cache-Control": "no-store"');
    expect(route).toContain('errorResponse(503, "feed_unavailable")');
    expect(route).not.toContain("error: message");
  });
});
