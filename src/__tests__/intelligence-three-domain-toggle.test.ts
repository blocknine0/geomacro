import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyIntelFilters, type IntelEvent } from "../lib/use-intelligence";
import { WEBSITE_RELEASE_DELAY_MS, websiteLaggedEvidenceRows } from "../lib/website-publication-delay";

const page = readFileSync("src/routes/intelligence.tsx", "utf8");
const monitor = readFileSync("src/components/intelligence/source-network-monitor.tsx", "utf8");

const event = (id: string, category: string): IntelEvent => ({
  id,
  category,
  title: `Geomacro finds ${id} policy shift`,
  summary: null,
  severity: 50,
  delta: null,
  sourceName: null,
  createdAt: "2026-10-11T12:00:00.000Z",
  publishedAt: "2026-10-11T11:00:00.000Z",
  isCurrent: false,
  publicStatus: "verified_b2",
});

describe("Intelligence public desk: 3 category toggles + >=60min delay", () => {
  it("shows exactly the three permanent Geomacro domains and scopes the entire desk", () => {
    expect(page).toContain('useState<(typeof COMMERCIAL_DOMAINS)[number]["key"]>("geopolitics")');
    expect(page).toContain('role="group" aria-label="Intelligence category"');
    expect(page).toContain('COMMERCIAL_DOMAINS.map((domain)');
    expect(page).toContain('aria-pressed={category === domain.key}');
    expect(page).toContain("pool.filter((event) => event.category === category)");
    expect(page).toContain("categoryLeads(currentDesk).filter((lead) => lead.key === category)");
    expect(page).toContain("intelligenceDomainPulse(intel.data?.all ?? []).filter((pulse) => pulse.key === category)");
    expect(page).toContain("applyIntelFilters(selectedPool, { category, query, sort: activeSort })");
    expect(page).toContain("historicalCount = selectedPool.length - currentDesk.length");
    expect(page).toContain("<SourceNetworkMonitor category={category} />");
    expect(monitor).toContain("PUBLIC_SOURCE_COVERAGE_DOMAINS.filter(row => !category || row.category === category)");
    expect(page).not.toContain('<option value="all">All categories</option>');
  });

  it("keeps a category-specific historical archive without cross-category stories", () => {
    const pool = [event("political", "geopolitics"), event("exchange", "macro"), event("supply", "rare_earth")];
    for (const category of ["geopolitics", "macro", "rare_earth"]) {
      const selectedPool = pool.filter((row) => row.category === category);
      const shown = applyIntelFilters(selectedPool, { category, query: "", sort: "newest" });
      expect(shown).toHaveLength(1);
      expect(shown[0].category).toBe(category);
    }
  });

  it("does not release a new assessment before the exact 60-minute cutoff", () => {
    const now = Date.parse("2026-10-12T15:00:00.000Z");
    const payload = [
      { published_at: "2026-10-12T14:00:00.000Z", created_at: "2026-10-12T13:30:00.000Z" },
      { published_at: "2026-10-12T14:00:01.000Z", created_at: "2026-10-12T13:30:00.000Z" },
    ];
    expect(WEBSITE_RELEASE_DELAY_MS).toBe(3_600_000);
    expect(websiteLaggedEvidenceRows(payload, now)).toEqual([payload[0]]);
    expect(page).toContain("Website view · delayed ≥60 minutes");
  });

  it("does not render an unverified publisher registry or unlicensed blanket credit", () => {
    expect(page).not.toContain("provider_name");
    expect(page).not.toContain("source_registry");
    expect(page).not.toContain("raw_source_url");
  });
});
