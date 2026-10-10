import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("industry-ready live-topic website contract", () => {
  it("keeps current-event claims distinct from structural country context", () => {
    const section = read("src/components/home/hot-topics-live.tsx");

    expect(section).toContain("Live developments stay separate from the structural country baseline");
    expect(section).toContain("temporary escalation, sanction, policy shock or disruption");
    expect(section).toContain("Structural context and live-event context are evaluated as separate layers");
  });

  it("fails visibly instead of synthesizing a hot-topic fallback", () => {
    const section = read("src/components/home/hot-topics-live.tsx");

    // Empty current feed is a truthful dated-archive disclosure. Never
    // return to showing high-scoring old records merely to fill a hero slot.
    expect(section).toContain("No current, originally dated and verified scored development is available");
    expect(section).toContain("Historical risk assessments remain in the dated Intelligence archive");
    expect(section).toContain("currentVerifiedDeskEvents(intelligence.data?.all ?? [])");
    expect(section).not.toContain("intelligence.data?.topRisks.slice(0, 6)");
  });

  it("locks the paid hot-topic freshness and commercial-eligibility boundary", () => {
    const section = read("src/components/home/hot-topics-live.tsx");
    const readiness = read("src/components/home/industry-readiness-section.tsx");

    expect(section).toContain("chargeable only when the requested current evidence passes freshness and commercial-eligibility checks");
    expect(readiness).toContain("maximum defensible sovereign coverage");
    expect(readiness).toContain("without lowering evidence, freshness or source-rights thresholds");
  });
});
