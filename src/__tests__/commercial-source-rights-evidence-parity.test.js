import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  COMMERCIAL_SOURCE_RIGHTS_EVIDENCE,
  VERIFIED_COMMERCIAL_SOURCE_IDS,
} from "../../scripts/commercial-source-rights-evidence.mjs";
import {
  COMMERCIAL_SOURCE_POLICY,
} from "../../scripts/commercial-source-policy.mjs";

const rightsDoc = readFileSync("docs/COMMERCIAL_SOURCE_RIGHTS.md", "utf8");
const qpsdReviewDoc = readFileSync("docs/WORLD_BANK_QPSD_SOURCE_REVIEW.md", "utf8");

const EXPECTED_VERIFIED = [
  "eurostat_government_finance",
  "gdelt_v2_events",
  "ucdp_candidate",
  "ucdp_ged",
  "unhcr_refugee_statistics",
  "usgs_earthquake_hazards",
  "usgs_mcs",
  "world_bank_indicators",
  "world_bank_qpsd",
  "world_bank_wgi_political_stability",
];

const EXPECTED_REVIEWED_ON = {
  eurostat_government_finance: "2026-09-15",
  gdelt_v2_events: "2026-09-15",
  ucdp_candidate: "2026-09-15",
  ucdp_ged: "2026-09-15",
  unhcr_refugee_statistics: "2026-09-15",
  usgs_earthquake_hazards: "2026-09-15",
  usgs_mcs: "2026-09-15",
  world_bank_indicators: "2026-09-15",
  world_bank_qpsd: "2026-09-16",
  world_bank_wgi_political_stability: "2026-09-15",
};

describe("commercial source rights evidence parity", () => {
  it("keeps the complete runtime VERIFIED set explicit and reviewed", () => {
    expect(VERIFIED_COMMERCIAL_SOURCE_IDS).toEqual(EXPECTED_VERIFIED);

    for (const sourceId of VERIFIED_COMMERCIAL_SOURCE_IDS) {
      const evidence = COMMERCIAL_SOURCE_RIGHTS_EVIDENCE[sourceId];
      expect(evidence.approved_status).toBe("VERIFIED");
      expect(evidence.reviewed_on).toBe(EXPECTED_REVIEWED_ON[sourceId]);
      expect(evidence.provider.length).toBeGreaterThan(2);
      expect(evidence.dataset.length).toBeGreaterThan(4);
      expect(evidence.licence.length).toBeGreaterThan(4);
      expect(evidence.terms_url).toMatch(/^https:\/\//);
      expect(evidence.dataset_url).toMatch(/^https:\/\//);
      expect(typeof evidence.attribution_required).toBe("boolean");
      expect(typeof evidence.raw_redistribution_allowed).toBe("boolean");
      expect(evidence.customer_delivery_mode.length).toBeGreaterThan(8);
      expect(evidence.boundary.length).toBeGreaterThan(20);
    }
  });

  it("derives runtime commercial eligibility from the reviewed evidence manifest", () => {
    expect(Object.keys(COMMERCIAL_SOURCE_POLICY).sort()).toEqual(
      Object.keys(COMMERCIAL_SOURCE_RIGHTS_EVIDENCE).sort(),
    );

    for (const [sourceId, evidence] of Object.entries(
      COMMERCIAL_SOURCE_RIGHTS_EVIDENCE,
    )) {
      expect(COMMERCIAL_SOURCE_POLICY[sourceId].allowed_statuses).toEqual([
        evidence.approved_status,
      ]);
      expect(COMMERCIAL_SOURCE_POLICY[sourceId].reviewed_on).toBe(
        evidence.reviewed_on,
      );
    }
  });

  it("keeps every runtime VERIFIED source visible in an explicit commercialization evidence document", () => {
    expect(rightsDoc).toContain("**Last reviewed:** 2026-09-15");
    expect(qpsdReviewDoc).toContain("**Reviewed:** 2026-09-16");

    for (const sourceId of VERIFIED_COMMERCIAL_SOURCE_IDS) {
      if (sourceId === "world_bank_qpsd") {
        expect(qpsdReviewDoc).toContain("`world_bank_qpsd`");
        expect(qpsdReviewDoc).toContain("Data Catalog dataset: `0037906`");
        expect(qpsdReviewDoc).toContain("production_activation_allowed=false");
      } else {
        expect(rightsDoc).toContain(`\`${sourceId}\``);
      }
    }
  });

  it("preserves ReliefWeb as DERIVED_ONLY rather than VERIFIED", () => {
    expect(COMMERCIAL_SOURCE_RIGHTS_EVIDENCE.reliefweb.approved_status).toBe(
      "DERIVED_ONLY",
    );
    expect(COMMERCIAL_SOURCE_POLICY.reliefweb.allowed_statuses).toEqual([
      "DERIVED_ONLY",
    ]);
  });
});
