import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("GOAT partner/funding evidence truth boundaries", () => {
  const manifest = JSON.parse(
    readFileSync("validation/goat-partner-evidence-manifest.v1.json", "utf8"),
  );
  const brief = readFileSync(
    "docs/GOAT_PARTNER_FUNDING_EVIDENCE_PACKAGE.md",
    "utf8",
  );

  it("never classifies Testnet3 settlement as commercial revenue", () => {
    expect(manifest.testnet.commercial_revenue).toBe(false);
    expect(manifest.testnet.paid_e2e.commercial_revenue).toBe(false);
    expect(brief).toContain("Testnet transactions are never counted as revenue");
  });

  it("does not claim a live dry-run or paid transaction before evidence exists", () => {
    expect(manifest.testnet.provider_dry_run.live_status).toBe(
      "BLOCKED_SECURE_CONFIGURATION",
    );
    expect(manifest.testnet.paid_e2e.live_status).toBe("NOT_EXECUTED");
    expect(brief).toContain("No successful provider dry-run claim is made until the sanitized artifact exists");
    expect(brief).toContain("No Testnet transaction hash is claimed yet");
  });

  it("does not claim an official GOAT partnership or GOAT-originated revenue", () => {
    expect(manifest.production.official_partner_status).toBe("NOT_YET_CONFIRMED");
    expect(manifest.production.commercial_revenue_status).toBe("NOT_YET_STARTED_VIA_GOAT");
    expect(brief).toContain("GOAT official partnership | Not yet confirmed");
    expect(brief).toContain("GOAT-originated commercial revenue | Not yet started");
  });

  it("keeps the GOAT rail separate from general Geomacro billing", () => {
    expect(manifest.production.general_billing_replaced_by_goat).toBe(false);
    expect(brief).toContain("not a replacement for Geomacro's general billing architecture");
    expect(brief).toContain("INR/USD");
  });

  it("keeps structured-only and non-execution product boundaries", () => {
    expect(manifest.data_delivery).toBe("structured_only");
    expect(manifest.raw_private_data_delivered).toBe(false);
    expect(manifest.execution_authorized).toBe(false);
    expect(brief).toContain("Customer-facing delivery is structured-only");
    expect(brief).toContain("`execution_authorized=false` is permanent");
  });
});
