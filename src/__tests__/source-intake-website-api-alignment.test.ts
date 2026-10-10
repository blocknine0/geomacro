import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  PUBLIC_SOURCE_COVERAGE_DOMAINS,
  publicIntelligenceSourceCoverage,
} from "../lib/public-intelligence-source-coverage";

describe("#1827 public source discovery vs real paid intelligence boundary", () => {
  it("publishes exact independently checked 778 catalog entries by 3 domains", () => {
    const counts = PUBLIC_SOURCE_COVERAGE_DOMAINS.map(row => row.catalogued_entries);
    expect(counts).toEqual([376, 355, 47]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(778);
    expect(PUBLIC_SOURCE_COVERAGE_DOMAINS.map(x => x.category)).toEqual([
      "geopolitics", "macro-fx", "critical-minerals",
    ]);
    for (const row of PUBLIC_SOURCE_COVERAGE_DOMAINS) {
      const lanes = Object.values(row.catalogued_by_lane);
      expect(lanes.reduce((a,b) => a + b, 0)).toBe(row.catalogued_entries);
      expect(row.catalogued_as_of).toBe("2026-10-10T16:21:28.311Z");
      expect(row.evidence_receipt_url).toBe("https://github.com/blocknine0/geomacro/actions/runs/38067310841");
      expect(row.catalog_mode).toBe("PINNED_SANITIZED_REPOSITORY_SNAPSHOT");
    }
  });

  it("never converts a source registration into fresh news, a signed GRO, or paid availability", () => {
    for (const entry of PUBLIC_SOURCE_COVERAGE_DOMAINS) {
      expect(entry.current_private_repository_sync_verified).toBe(false);
      expect(entry.current_event_observed_by_this_catalog).toBe(false);
      expect(entry.current_scored_intelligence_from_this_catalog).toBe(false);
      expect(entry.catalog_entry_is_distinct_publisher).toBe(false);
      expect(entry.paid_intelligence_authorized_by_catalog).toBe(false);
      expect(entry.requires_independent_paid_availability).toBe(true);
      expect(entry.intelligence_delivery_mode).toBe("EXISTING_VERIFIED_RISK_OBJECT_GATE_ONLY");
      expect(entry.intelligence_query_method).toBe("POST");
      expect(entry.source_catalog_snapshot_automatically_updates_this_api).toBe(false);
    }
  });

  it.each([
    ["geopolitics", "/api/v1/intelligence/geopolitics", 376],
    ["macro-fx", "/api/v1/intelligence/macro-fx", 355],
    ["critical-minerals", "/api/v1/intelligence/critical-minerals", 47],
  ] as const)("aligns %s with its single canonical-scoped public endpoint", (category, path, total) => {
    const coverage = publicIntelligenceSourceCoverage(category);
    const api = readFileSync(`src/routes/api.v1.intelligence.${category}.ts`, "utf8");
    expect(api).toContain(`path: "${path}"`);
    expect(api).toContain(`category: "${category}"`);
    expect(coverage.catalogued_entries).toBe(total);
    expect(coverage.intelligence_query_path).toBe(path);
  });

  it("keeps the GET discovery as an annotated sideband; POST still delegates to canonical x402", () => {
    const handlers = readFileSync("src/lib/category-intelligence-alias.server.ts", "utf8");
    expect(handlers).toContain("source_intake: publicIntelligenceSourceCoverage(");
    expect(handlers).toContain("return mainnetIntelligenceHandlers.POST({ request: canonicalRequest })");
    expect(handlers).toContain("if (!response.ok) return response");
    expect(handlers).toContain("availability_check: \"POST_WITHOUT_PAYMENT_SIGNATURE\"");
  });

  it("shows the pinned snapshot as source discovery on Intelligence, separate from the live feed", () => {
    const page = readFileSync("src/routes/intelligence.tsx", "utf8");
    expect(page).toContain("PUBLIC_SOURCE_COVERAGE_DOMAINS.map");
    expect(page).toContain("Catalogued source entries · not published intelligence");
    expect(page).toContain("Current independently verified scored events: not available");
    expect(page).toContain("Private Telegram/historical registries are pinned snapshots");
    expect(page).toContain("intelligence_query_path");
    expect(page).toContain("livePulse?.currentScoredCount");
    expect(page).toContain("every five minutes while open");
    expect(page).toContain("currentVerifiedDeskEvents(pool)");
  });
});
