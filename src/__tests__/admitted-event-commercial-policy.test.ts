import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/052_admitted_event_derived_delivery_policy.sql",
    import.meta.url,
  ),
  "utf8",
);

const repairMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20261001173500_restore_admitted_event_rights_lanes.sql",
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
    expect(repairMigration).toContain("admitted_events_guardian_ineligible");
    expect(repairMigration).toContain("'INELIGIBLE'");
  });

  it("keeps GDACS review-gated and missing provenance fail closed", () => {
    expect(migration).toContain("'gdacs.org'");
    expect(migration).toContain("then 'REVIEW_REQUIRED'");
    expect(migration).toContain("= 'unknown'");
    expect(repairMigration).toContain("admitted_events_gdacs_review");
    expect(repairMigration).toContain("then 'admitted_events'");
  });

  it("limits the remaining current aggregate discovery lanes to DERIVED_ONLY", () => {
    expect(migration).toContain("else 'DERIVED_ONLY'");
    expect(migration).toContain("commercial_source_derived_only");
    expect(repairMigration).toContain("admitted_events_derived_discovery");
    expect(repairMigration).toContain("'DERIVED_ONLY'");
  });

  it("keeps the reviewed lane identity stable through live, targeted, archive and delete rights paths", () => {
    expect(repairMigration).toContain(
      "geomacro_effective_structured_evidence_source_key",
    );
    expect(repairMigration).toContain(
      "create or replace view public.live_structured_event_commercial_rights_evaluation",
    );
    expect(repairMigration).toContain(
      "create or replace function public.geomacro_structured_event_rights_snapshot",
    );
    expect(repairMigration).toContain(
      "create or replace function public.geomacro_structured_evidence_archive_candidates",
    );
    expect(repairMigration).toContain(
      "create or replace function public.geomacro_structured_evidence_delete_candidates",
    );
    expect(repairMigration).toContain(
      "create or replace function public.sync_structured_event_rights_from_source_policy",
    );
  });

  it("preserves fail-closed and no-raw archival boundaries", () => {
    expect(repairMigration).toContain("INTERNAL_INHERIT_ONLY");
    expect(repairMigration).toContain("redistribution_allowed");
    expect(repairMigration).toContain("raw_storage_policy");
    expect(repairMigration).not.toMatch(/delete\s+from\s+public\.live_structured_event_evidence/i);
    expect(repairMigration).not.toContain("execution_authorized = true");
  });

  it("allows derived evidence only through the no-raw GRO delivery boundary", () => {
    expect(resolver).toContain("derived_only_delivery_no_raw_redistribution");
    expect(resolver).toContain('item.status === "VERIFIED" ||');
    expect(resolver).toContain('item.status === "DERIVED_ONLY"');
  });

  it("does not introduce execution or payment authority", () => {
    expect(migration).not.toContain("execution_authorized = true");
    expect(migration).not.toContain("GOAT_TESTNET3_USDC");
    expect(repairMigration).not.toContain("execution_authorized = true");
    expect(repairMigration).not.toContain("GOAT_TESTNET3_USDC");
    expect(resolver).not.toContain("execution_authorized");
  });
});
