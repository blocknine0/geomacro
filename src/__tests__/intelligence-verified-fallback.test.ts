import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("Intelligence verified fallback contract", () => {
  it("keeps bounded verified B2 public snapshots readable during upstream outages", () => {
    const source = read("src/lib/b2-live.server.ts");
    expect(source).toContain("PUBLIC_INTELLIGENCE_FALLBACK_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000");
    expect(source).toContain("PUBLIC_RISK_FALLBACK_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000");
    expect(source).toContain("recentEnough(payload.generated_at, PUBLIC_INTELLIGENCE_FALLBACK_MAX_AGE_MS)");
    expect(source).toContain("recentEnough(payload.generated_at, PUBLIC_RISK_FALLBACK_MAX_AGE_MS)");
    expect(source).toContain('["geopolitics", "macro", "rare_earth"]');
  });

  it("keeps scored context separate from certified current unscored evidence", () => {
    const productionReader = read("src/lib/public-intelligence-production.server.ts");
    const recoveryReader = read("src/lib/public-intelligence.functions.ts");
    const api = read("server/api/public/intelligence.get.ts");
    const hook = read("src/lib/use-intelligence.ts");
    const directPublisher = read("scripts/ops/publish-b2-public-intelligence-direct-postgres.mjs");

    expect(productionReader).toContain("readB2PublicIntelligence");
    expect(productionReader).not.toContain("getAppSupabase");
    expect(productionReader).toContain('public_status: "verified_b2" | "live_observed"');
    expect(productionReader).toContain('SCORED_TITLE_PREFIX = "Geomacro finds "');
    expect(productionReader).toContain('LIVE_TITLE_PREFIX = "Geomacro observes "');
    expect(productionReader).toContain("normalizedLiveObservedRow");
    expect(productionReader).toContain("INTELLIGENCE_SCORED_PACKAGE_EMPTY");
    expect(productionReader).toContain("assertThreeDomainCoverage");
    expect(productionReader).toContain('mode: liveRows.length > 0 ? "verified_b2_plus_live_observed" : "verified_b2"');
    expect(productionReader).not.toContain("fetchUsgsMacro");

    expect(recoveryReader).toContain("normalizeScoredRow");
    expect(recoveryReader).toContain("normalizeLiveObservedRow");
    expect(recoveryReader).toContain('.not("severity", "is", null)');
    expect(recoveryReader).toContain('.or("source_name.is.null,source_name.not.ilike.%guardian%")');
    expect(recoveryReader).toContain('.or("source_domain.is.null,source_domain.not.in.(theguardian.com,www.theguardian.com)")');
    expect(recoveryReader).not.toMatch(/\.select\([^)]*source_name/s);
    expect(recoveryReader).not.toMatch(/\.select\([^)]*source_domain/s);
    expect(recoveryReader).toContain("derivedEnglishTitle");
    expect(recoveryReader).toContain('row.public_status !== "live_observed"');
    expect(recoveryReader).toContain("row.severity !== null");
    expect(recoveryReader).toContain("row.delta !== null");

    expect(api).toContain("readProductionPublicIntelligence");
    expect(hook).toContain('/api/public/intelligence');
    expect(hook).not.toContain("useServerFn");
    expect(hook).toContain('r.public_status === "live_observed"');
    expect(hook).toContain('hasLiveObserved: liveRows.length > 0');
    expect(hook).toContain('r.publicStatus === "verified_b2"');

    expect(directPublisher).toContain('GDELT_LAST_UPDATE_URL = "https://data.gdeltproject.org/gdeltv2/lastupdate.txt"');
    expect(directPublisher).toContain("GDELT_EXPECTED_COLUMNS = 61");
    expect(directPublisher).toContain('CURRENT_EVIDENCE_CONTRACT = "gdelt-v2-event-export-conflict-root-v1"');
    expect(directPublisher).toContain("readGdeltDocCurrentRows");
    expect(directPublisher).toContain("current_source_transport: current.sourceTransport");
    expect(directPublisher).toContain("CURRENT_GDELT_EXPORT_MD5_MISMATCH");
    expect(directPublisher).toContain('public_status: "live_observed"');
    expect(directPublisher).toContain('title = `Geomacro observes ${label} in ${place}${countrySuffix}`');
    expect(directPublisher).toContain("PUBLIC_INTELLIGENCE_LIVE_OBSERVED_ROW_INVALID");
    expect(directPublisher).toContain("row?.severity !== null");
    expect(directPublisher).toContain('live_observed_unscored: true');
    expect(directPublisher).toContain('real_event_timestamps_preserved: true');
    expect(directPublisher).toContain('synthetic_score: false');
    expect(directPublisher).toContain('raw_source_headlines_exposed: false');
    expect(directPublisher).toContain('provider_identity_exposed: false');
    expect(directPublisher).toContain("PUBLIC_INTELLIGENCE_SOURCE_IDENTITY_EXPOSED");
    expect(directPublisher).toContain("publishHotOverlay(current, generatedAt)");
    expect(directPublisher).toContain('HOT_OVERLAY_SCHEMA = "geomacro.public-intelligence-live-observed.v1"');
    expect(directPublisher).toContain('HOT_OVERLAY_MAX_BYTES = 30 * 1024');
    expect(directPublisher).toContain('"cloudflare-d1-hot-overlay"');
    expect(directPublisher).toContain('raw_source_headlines_exposed: false');
    expect(directPublisher).toContain('provider_identity_exposed: false');
  });
});
