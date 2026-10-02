import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  commercialSourceEligibilityFromRow,
  type SourceRightsRow,
} from "../lib/commercial-source-eligibility.server";

const read = (path: string) => readFileSync(path, "utf8");

function row(overrides: Partial<SourceRightsRow> = {}): SourceRightsRow {
  return {
    source_id: "example",
    category: "GEOPOLITICS",
    certification_state: "CERTIFIED",
    commercial_usage_status: "COMMERCIAL_OK",
    enabled_for_ingestion: true,
    enabled_for_commercial_signals: true,
    raw_redistribution_allowed: false,
    attribution_required: true,
    licence_name: "Example",
    ...overrides,
  };
}

describe("commercial source-rights B2 outage fallback", () => {
  it("uses the structured-derived paid-output eligibility predicate", () => {
    const derivedOnlyRawBlocked = commercialSourceEligibilityFromRow("example", row());
    expect(derivedOnlyRawBlocked.eligible).toBe(true);
    expect(derivedOnlyRawBlocked.raw_redistribution_allowed).toBe(false);
    expect(derivedOnlyRawBlocked.delivery_boundary).toBe("DERIVED_ONLY");
    expect(derivedOnlyRawBlocked.raw_payload_allowed).toBe(false);
    expect(derivedOnlyRawBlocked.reason).toBeNull();

    const explicitDerivedStatus = commercialSourceEligibilityFromRow(
      "example",
      row({ commercial_usage_status: "DERIVED_ONLY" }),
    );
    expect(explicitDerivedStatus.eligible).toBe(true);

    const signalsDisabled = commercialSourceEligibilityFromRow(
      "example",
      row({ enabled_for_commercial_signals: false }),
    );
    expect(signalsDisabled.eligible).toBe(false);
    expect(signalsDisabled.reason).toBe("SOURCE_COMMERCIAL_SIGNALS_DISABLED");

    const rightsPending = commercialSourceEligibilityFromRow(
      "example",
      row({ commercial_usage_status: "REVIEW_REQUIRED" }),
    );
    expect(rightsPending.eligible).toBe(false);
    expect(rightsPending.reason).toBe("SOURCE_COMMERCIAL_STATUS_REVIEW_REQUIRED");
  });

  it("uses B2 first and keeps Supabase as an explicitly allowed standby read", () => {
    const source = read("src/lib/commercial-source-eligibility.server.ts");
    expect(source).toContain("await readB2CommercialSourceRights()");
    expect(source).toContain("supabaseReadFallbackAllowed()");
    expect(source).toContain("COMMERCIAL_SOURCE_RIGHTS_B2_UNAVAILABLE_SUPABASE_STANDBY");
    expect(source).toContain("COMMERCIAL_SOURCE_RIGHTS_UNAVAILABLE");
  });

  it("bounds and validates the private B2 rights plus certification snapshot", () => {
    const source = read("src/lib/b2-live.server.ts");
    expect(source).toContain("COMMERCIAL_SOURCE_RIGHTS_FALLBACK_MAX_AGE_MS = 24 * 60 * 60 * 1000");
    expect(source).toContain("geomacro.commercial-source-rights-live.v2");
    expect(source).toContain("payload.source_project !== \"ldpwajisioljyjtojvfx\"");
    expect(source).toContain("payload.rows.length > 2_000");
    expect(source).toContain("seen.has(sourceId)");
    expect(source).toContain("certification_state");
    expect(source).toContain("category");
  });

  it("publishes every registry page with certification state and verifies B2 readback", () => {
    const publisher = read("scripts/ops/publish-b2-live-snapshots.ts");
    expect(publisher).toContain('.from("live_external_sources")');
    expect(publisher).toContain('.from("live_source_certification_records")');
    expect(publisher).toContain("SOURCE_RIGHTS_PAGE_SIZE = 1000");
    expect(publisher).toContain(".range(offset, offset + SOURCE_RIGHTS_PAGE_SIZE - 1)");
    expect(publisher).toContain("B2_LIVE_SOURCE_RIGHTS_TRUNCATION_GUARD");
    expect(publisher).toContain("B2_LIVE_SOURCE_CERTIFICATION_TRUNCATION_GUARD");
    expect(publisher).toContain("source_id,category,commercial_usage_status,enabled_for_ingestion,enabled_for_commercial_signals,raw_redistribution_allowed,attribution_required,licence_name");
    expect(publisher).toContain("geomacro.commercial-source-rights-live.v2");
    expect(publisher).toContain("B2_LIVE_PAID_OUTPUT_SOURCE_SET_NOT_READY");
    expect(publisher).toContain("await b2.get(item.key)");
  });
});
