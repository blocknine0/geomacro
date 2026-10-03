import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateGlobalRiskContinuity } from "@/lib/global-risk-continuity";
import type {
  GlobalRisk,
  RiskDomainReading,
  Timeframe,
} from "@/lib/global-risk.types";

const HOUR = 60 * 60 * 1000;
const AS_OF = Date.parse("2026-10-01T16:30:47.667Z");
const HEX = "a".repeat(64);
const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

function buckets(hours: number[]) {
  return hours.map((ago, index) => ({
    t: AS_OF - ago * HOUR,
    avg: 40 + index,
    count: 12 + index,
  }));
}

function series(timeframe: Timeframe, values: ReturnType<typeof buckets>) {
  const sorted = [...values].sort((a, b) => a.t - b.t);
  const scores = sorted.map((value) => value.avg);
  return {
    timeframe,
    buckets: sorted,
    low: Math.min(...scores),
    high: Math.max(...scores),
  };
}

function domainReading(
  rawScore: number,
  previousScore: number,
  h24: ReturnType<typeof buckets>,
  d7: ReturnType<typeof buckets>,
  d30: ReturnType<typeof buckets>,
): RiskDomainReading {
  return {
    score: Math.round(rawScore),
    rawScore,
    previousScore,
    changePoints: rawScore - previousScore,
    confidence: 82,
    eventCount: 7,
    sourceCount: 5,
    independentStoryCount: 6,
    series: {
      "24H": series("24H", h24),
      "7D": series("7D", d7),
      "30D": series("30D", d30),
    },
  };
}

function fixture(): GlobalRisk {
  const h24 = buckets([20, 8, 0]);
  const d7 = buckets([6 * 24, 5 * 24, 4 * 24, 3 * 24, 2 * 24, 24, 0]);
  const d30 = buckets([28 * 24, 21 * 24, 14 * 24, 7 * 24, 5 * 24, 3 * 24, 24, 0]);
  return {
    snapshotId: "11111111-1111-4111-8111-111111111111",
    score: 47,
    rawScore: 46.75,
    previous: 46,
    previousRaw: 45.8,
    low: 40,
    high: 47,
    eventCount: 19,
    eventCountPrevious: null,
    sourceCount: 9,
    independentStoryCount: 11,
    storyCorrelationVersion: "gri-story-correlation-v1.0.0",
    storyCorrelationPromptVersion: "gri-story-correlation-prompt-v1.0.0",
    coverage: 1,
    weightedConfidence: 82,
    methodologyVersion: "gri-v1.2.0",
    auditPersisted: true,
    proofVersion: "gri-proof-v1.2.0",
    verificationStatus: "verified",
    proofHash: HEX,
    evidenceHash: HEX,
    calculationHash: HEX,
    dispositionHash: HEX,
    candidateEventCount: 21,
    inputHash: HEX,
    methodologyHash: HEX,
    changeHash: HEX,
    reconciliationResidual: 0,
    changeResidual: 0,
    snapshotAsOf: new Date(AS_OF).toISOString(),
    usedFallbackWindow: false,
    series: {
      "24H": series("24H", h24),
      "7D": series("7D", d7),
      "30D": series("30D", d30),
    },
    domainIndices: {
      geopolitics: domainReading(51, 49, h24, d7, d30),
      macro: domainReading(44, 45, h24, d7, d30),
      rare_earth: domainReading(46, 44, h24, d7, d30),
    },
    drivers: [],
    topDriver: null,
    recentEvents: [],
  };
}

describe("Global Risk historical continuity", () => {
  it("accepts verified same-methodology history whose latest bucket binds to the snapshot", () => {
    expect(validateGlobalRiskContinuity(fixture(), AS_OF + HOUR)).toEqual({ ok: true });
  });

  it("fails closed when the 7D historical timeline disappears", () => {
    const risk = fixture();
    risk.series["7D"] = { timeframe: "7D", buckets: null, low: null, high: null };
    expect(validateGlobalRiskContinuity(risk, AS_OF + HOUR)).toEqual({
      ok: false,
      code: "RISK_HISTORY_7D_MISSING",
    });
  });

  it("fails closed when historical buckets are reordered or truncated away from the current snapshot", () => {
    const reordered = fixture();
    reordered.series["30D"].buckets = [...(reordered.series["30D"].buckets ?? [])].reverse();
    expect(validateGlobalRiskContinuity(reordered, AS_OF + HOUR)).toEqual({
      ok: false,
      code: "RISK_HISTORY_30D_ORDER_INVALID",
    });

    const truncated = fixture();
    truncated.series["7D"].buckets = truncated.series["7D"].buckets?.slice(0, -1) ?? null;
    expect(validateGlobalRiskContinuity(truncated, AS_OF + HOUR)).toEqual({
      ok: false,
      code: "RISK_HISTORY_7D_LATEST_MISMATCH",
    });
  });

  it("anchors source history to the latest verified snapshot instead of wall-clock time", () => {
    const supabaseReader = read("src/lib/global-risk-read.server.ts");
    const directPublisher = read("scripts/ops/publish-b2-global-risk-direct-postgres.mjs");

    expect(supabaseReader).toContain('.eq("verification_status", "verified")');
    expect(supabaseReader).not.toContain('.gte("as_of"');
    expect(supabaseReader).toContain("assembler clips the newest verified rows relative to the latest");
    expect(directPublisher).toContain("history_anchor: \"latest-verified-snapshot\"");
    expect(directPublisher).not.toContain("as_of >= now()");
    expect(directPublisher).toContain("verified_snapshot_rows: snapshots");
  });

  it("never accepts a fabricated future snapshot", () => {
    const risk = fixture();
    expect(validateGlobalRiskContinuity(risk, AS_OF - 10 * 60 * 1000)).toEqual({
      ok: false,
      code: "RISK_SNAPSHOT_TIME_INVALID",
    });
  });
});
