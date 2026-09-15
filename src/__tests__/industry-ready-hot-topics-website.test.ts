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

    expect(section).toContain("Current scored events are temporarily unavailable");
    expect(section).toContain("does not fill the gap with synthetic headlines or a fallback risk claim");
  });

  it("locks the paid hot-topic freshness and commercial-eligibility boundary", () => {
    const section = read("src/components/home/hot-topics-live.tsx");
    const readiness = read("src/components/home/industry-readiness-section.tsx");

    expect(section).toContain("chargeable only when the requested current evidence passes freshness and commercial-eligibility checks");
    expect(readiness).toContain("maximum defensible sovereign coverage");
    expect(readiness).toContain("without lowering evidence, freshness or source-rights thresholds");
  });
});
