import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/052_admitted_event_derived_delivery_policy.sql",
    import.meta.url,
  ),
  "utf8",
);

const ingestNews = readFileSync(
  new URL(
    "../../scripts/ingest-news.js",
    import.meta.url,
  ),
  "utf8",
);

const resolver = readFileSync(
  new URL(
    "../lib/country-risk-commercial-eligibility.ts",
    import.meta.url,
  ),
  "utf8",
);

describe("admitted-event commercial discovery policy", () => {
  it("locks the current discovery-provider contract so a new provider cannot silently inherit rights", () => {
    const providers = [
      ...ingestNews.matchAll(/discoveryProvider:\s*'([^']+)'/g),
    ].map((match) => match[1]);

    expect([...new Set(providers)].sort()).toEqual([
      "gdacs",
      "gdelt",
      "guardian",
      "reliefweb",
    ]);
  });

  it("keeps direct Guardian content out of the automated commercial path", () => {
    expect(migration).toContain("'theguardian.com'");
    expect(migration).toContain("then 'INELIGIBLE'");
  });

  it("keeps GDACS review-gated and missing provenance fail closed", () => {
    expect(migration).toContain("'gdacs.org'");
    expect(migration).toContain("then 'REVIEW_REQUIRED'");
    expect(migration).toContain("= 'unknown'");
  });

  it("limits the remaining current aggregate discovery lanes to DERIVED_ONLY", () => {
    expect(migration).toContain("else 'DERIVED_ONLY'");
    expect(migration).toContain("commercial_source_derived_only");
  });

  it("allows derived evidence only through the no-raw GRO delivery boundary", () => {
    expect(resolver).toContain("derived_only_delivery_no_raw_redistribution");
    expect(resolver).toContain('item.status === "VERIFIED" ||');
    expect(resolver).toContain('item.status === "DERIVED_ONLY"');
  });

  it("does not introduce execution or payment authority", () => {
    expect(migration).not.toContain("execution_authorized = true");
    expect(migration).not.toContain("GOAT_TESTNET3_USDC");
    expect(resolver).not.toContain("execution_authorized");
  });
});
