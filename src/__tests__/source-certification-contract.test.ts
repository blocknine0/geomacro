import { describe, expect, it } from "vitest";

import {
  certificationEvidenceComplete,
  endpointDispositionComplete,
  endpointUsableForCertification,
  rightsUsableForDerivedCommercialDelivery,
} from "../lib/source-certification-contract";

describe("source certification gates", () => {
  it("distinguishes transport disposition from endpoint usability", () => {
    expect(endpointDispositionComplete("PASS")).toBe(true);
    expect(endpointDispositionComplete("WAF")).toBe(true);
    expect(endpointDispositionComplete("UNTESTED")).toBe(false);

    expect(endpointUsableForCertification("PASS")).toBe(true);
    expect(endpointUsableForCertification("WAF")).toBe(false);
    expect(endpointUsableForCertification("CANONICAL_REQUIRED")).toBe(false);
  });

  it("allows derived-only commercial use without implying raw redistribution rights", () => {
    expect(rightsUsableForDerivedCommercialDelivery("COMMERCIAL_OK")).toBe(true);
    expect(rightsUsableForDerivedCommercialDelivery("DERIVED_ONLY")).toBe(true);
    expect(rightsUsableForDerivedCommercialDelivery("PERMISSION_REQUIRED")).toBe(false);
    expect(rightsUsableForDerivedCommercialDelivery("REVIEW_REQUIRED")).toBe(false);
  });

  it("requires every production gate before a source becomes CERTIFIED", () => {
    const base = {
      certification_state: "CERTIFIED" as const,
      endpoint_status: "PASS" as const,
      rights_status: "DERIVED_ONLY" as const,
      schema_status: "PASS" as const,
      freshness_status: "FRESH" as const,
      provenance_status: "PASS" as const,
      independence_status: "PASS" as const,
      adapter_status: "TESTED" as const,
      runtime_status: "PASS" as const,
      fallback_status: "READY" as const,
      certified_at: "2026-09-20T00:00:00Z",
      certification_hash: "a".repeat(64),
    };

    expect(certificationEvidenceComplete(base)).toBe(true);

    for (const patch of [
      { endpoint_status: "WAF" as const },
      { rights_status: "PERMISSION_REQUIRED" as const },
      { schema_status: "PARTIAL" as const },
      { freshness_status: "STALE" as const },
      { provenance_status: "PARTIAL" as const },
      { independence_status: "PARTIAL" as const },
      { adapter_status: "MAPPED" as const },
      { runtime_status: "DEGRADED" as const },
      { fallback_status: "FAIL" as const },
      { certification_hash: null },
    ]) {
      expect(certificationEvidenceComplete({ ...base, ...patch })).toBe(false);
    }
  });
});
