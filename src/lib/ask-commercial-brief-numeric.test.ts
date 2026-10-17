import { describe, expect, it } from "vitest";
import { toCommercialAskBrief } from "./ask-commercial-brief";
import type { AskAnswer } from "./ask-geomacro-core.server";

describe("official numeric direct-answer formatting", () => {
  const base = {
    summary: "India's latest available ANNUAL consumer-price inflation is 4.2% for 2025.",
    what_changed: "Compared with 2024 the annual rate changed -1.0 percentage points.",
    why_it_matters: "Annual WDI rate is not a current monthly release.",
    geomacro_view: "World Bank WDI source 2, original year 2025.",
    evidence: [{ eventId: "live:official:numeric", title: "Derived annual reference year 2025", relevance: 100 }],
    insufficient_evidence: false, low_confidence: false, mean_relevance: null,
    source_identity_exposed: false, durable_live_storage_write: false, gri: null,
    generatedAt: "2026-10-17T09:50:00Z",
  } as AskAnswer;
  it("answers a latest numeric question with the figure and period, not the prior-year delta", () => {
    const answer = toCommercialAskBrief(base, "India latest inflation rate?");
    expect(answer.summary).toContain("4.2% for 2025");
    expect(answer.summary).toContain("ANNUAL");
    expect(answer.summary).not.toContain("Compared with 2024");
    expect(answer.what_changed).toContain("-1.0 percentage points");
    expect(answer.insufficient_evidence).toBe(false);
    expect(answer.evidence).toBe(base.evidence);
  });
  it("does not promote an unavailable official number into verified evidence", () => {
    const missing = toCommercialAskBrief({ ...base,
      insufficient_evidence:true, evidence:[],
      summary:"Exact official number unavailable.",
      what_changed:"No matching official numeric record was verified.",
    }, "India latest inflation rate?");
    expect(missing.insufficient_evidence).toBe(true);
    expect(missing.summary).toContain("No matching official numeric record");
  });
});
