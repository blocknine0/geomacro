import { describe, expect, it } from "vitest";
import { freshnessMaxAgeHours } from "@/lib/ask-freshness";

describe("Ask original-publication freshness intent", () => {
  it("requires recent evidence for currently changing developments", () => {
    expect(freshnessMaxAgeHours("What is changing in critical minerals?")).toBe(24);
    expect(freshnessMaxAgeHours("What is changing in geopolitics?")).toBe(24);
    expect(freshnessMaxAgeHours("What is happening in the macro economy?")).toBe(24);
    expect(freshnessMaxAgeHours("Any new developments in rare earths?")).toBe(24);
    expect(freshnessMaxAgeHours("What changed today?")).toBe(24);
  });

  it("preserves existing tighter windows for explicit current/latest", () => {
    expect(freshnessMaxAgeHours("What is the latest country risk?")).toBe(6);
    expect(freshnessMaxAgeHours("What is happening right now?")).toBe(6);
    expect(freshnessMaxAgeHours("Current geopolitical risk in India")).toBe(6);
  });

  it("does not impose a freshness requirement on ordinary historical analysis", () => {
    expect(freshnessMaxAgeHours("Explain lithium supply chains")).toBeNull();
    expect(freshnessMaxAgeHours("How did trade policies evolve in 2020?")).toBeNull();
    expect(freshnessMaxAgeHours("Summarize the long-term risks of copper")).toBeNull();
  });
});
