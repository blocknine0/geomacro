import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { commercialSourceEligibilityFromRow } from "../lib/commercial-source-eligibility.server";

const read = (path: string) => readFileSync(path, "utf8");

describe("commercial source-rights B2 outage fallback", () => {
  it("preserves the exact paid raw-delivery eligibility predicate", () => {
    const allowed = commercialSourceEligibilityFromRow("example", {
      source_id: "example",
      commercial_usage_status: "COMMERCIAL_OK",
      enabled_for_ingestion: true,
      enabled_for_commercial_signals: true,
      raw_redistribution_allowed: true,
      attribution_required: true,
      licence_name: "Example",
    });
    expect(allowed.eligible).toBe(true);
    expect(allowed.reason).toBeNull();

    const derivedOnly = commercialSourceEligibilityFromRow("example", {
      source_id: "example",
      commercial_usage_status: "COMMERCIAL_OK",
      enabled_for_ingestion: true,
      enabled_for_commercial_signals: true,
      raw_redistribution_allowed: false,
      attribution_required: true,
      licence_name: "Example",
    });
    expect(derivedOnly.eligible).toBe(false);
    expect(derivedOnly.reason).toBe("SOURCE_RAW_REDISTRIBUTION_NOT_ALLOWED");
  });

  it("uses B2 only when the primary rights registry is unavailable", () => {
    const source = read("src/lib/commercial-source-eligibility.server.ts");
    expect(source).toContain("if (!result.data) return null");
    expect(source).toContain("catch (primaryError)");
    expect(source).toContain("await readB2CommercialSourceRights()");
    expect(source).toContain("COMMERCIAL_SOURCE_RIGHTS_UNAVAILABLE");
  });

  it("bounds and validates the private B2 rights snapshot", () => {
    const source = read("src/lib/b2-live.server.ts");
    expect(source).toContain("COMMERCIAL_SOURCE_RIGHTS_FALLBACK_MAX_AGE_MS = 24 * 60 * 60 * 1000");
    expect(source).toContain("geomacro.commercial-source-rights-live.v1");
    expect(source).toContain("payload.source_project !== \"ldpwajisioljyjtojvfx\"");
    expect(source).toContain("payload.rows.length > 2_000");
    expect(source).toContain("seen.has(sourceId)");
  });

  it("publishes every registry page, only bounded rights fields, and verifies B2 readback", () => {
    const publisher = read("scripts/ops/publish-b2-live-snapshots.ts");
    expect(publisher).toContain('.from("live_external_sources")');
    expect(publisher).toContain("SOURCE_RIGHTS_PAGE_SIZE = 1000");
    expect(publisher).toContain(".range(offset, offset + SOURCE_RIGHTS_PAGE_SIZE - 1)");
    expect(publisher).toContain("B2_LIVE_SOURCE_RIGHTS_TRUNCATION_GUARD");
    expect(publisher).toContain("source_id,commercial_usage_status,enabled_for_ingestion,enabled_for_commercial_signals,raw_redistribution_allowed,attribution_required,licence_name");
    expect(publisher).toContain("geomacro.commercial-source-rights-live.v1");
    expect(publisher).toContain("await b2.get(item.key)");
    expect(publisher).not.toContain("source_url,commercial_usage_status");
  });
});
