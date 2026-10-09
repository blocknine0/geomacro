import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { classifyPrivateDerivedTextQuality, preparePrivateDerivedText, validatePrivateDerivedRecord } from "../../scripts/lib/private-derived-text-quality.mjs";
import { makePrivateStageRecord, makePrivateStageBundle, validatePrivateStageBundle } from "../../scripts/lib/restricted-private-scored-stage.mjs";

const base = {
  article: {
    url: "https://publisher.example.org/2026/10/09/real-risk-change",
    sourceDomain: "publisher.example.org",
    title: "New government actions materially affect shipping and trade routes",
    publishedAt: "2026-10-09T08:15:00Z",
  },
  assessment: {
    relevant: true, category: "geopolitics", ungrounded: false,
    severity: 74, confidence: 81,
    narrative: "A national government announced restrictions affecting a major cross-border transport corridor.",
    summary: "The announced restrictions affect cross-border trade corridors, and are expected to raise transport delays.",
    classificationProvider: "groq", classificationModel: "example-model",
    classificationVersion: "event-severity-v1.0.5",
    classificationPromptVersion: "risk-desk-filter-v1.0.5",
    classificationInputHash: "1".repeat(64),
  },
  category: "geopolitics",
  now: new Date("2026-10-09T08:20:00Z"),
};

describe("private model-derived text quality without invented or published facts", () => {
  it("preserves valid concise classifier text and no public permissions", () => {
    const x = preparePrivateDerivedText(base.assessment);
    expect(x.editorial_review_pending).toBe(false);
    expect(x.narrative).toBe(base.assessment.narrative);
    expect(x.summary).toBe(base.assessment.summary);
    const row = makePrivateStageRecord(base);
    expect(row.editorial_review_pending).toBe(false);
    expect(row.public_eligible).toBe(false);
    expect(row.rights_verified).toBe(false);
    expect(row.independently_corroborated).toBe(false);
    expect(validatePrivateDerivedRecord(row)).toBe(true);
    const b = makePrivateStageBundle([row], { now: base.now });
    expect(validatePrivateStageBundle(b, { now: base.now }).rows[0].id).toBe(row.id);
  });
  it("keeps verbose classifier assertions losslessly in private archive, marked editorial pending", () => {
    const narrative = "Authorities reported a material new development for critical supplies. ".repeat(8).trim();
    const summary = "The material changed trade and supply conditions. ".repeat(23).trim();
    const row = makePrivateStageRecord({
      ...base, assessment: { ...base.assessment, narrative, summary },
    });
    expect(row.narrative).toBe(narrative);
    expect(row.summary).toBe(summary);
    expect(row.editorial_review_pending).toBe(true);
    expect(row.public_eligible).toBe(false);
    expect(validatePrivateStageBundle(makePrivateStageBundle([row], { now: base.now }), { now: base.now }).rows[0].editorial_review_pending).toBe(true);
    expect(classifyPrivateDerivedTextQuality({ narrative, summary }).narrative_length_band).toBe("verbose_private");
    expect(classifyPrivateDerivedTextQuality({ narrative, summary }).summary_length_band).toBe("verbose_private");
    expect(() => validatePrivateDerivedRecord({ ...row, editorial_review_pending: false })).toThrow("PRIVATE_SCORING_DERIVED_RECORD_INVALID");
  });
  it("reuses only the OTHER classifier-provided text if one is short, with editorial-review flag", () => {
    const x = preparePrivateDerivedText({ narrative: "...", summary: base.assessment.summary });
    expect(x.narrative).toBe(base.assessment.summary);
    expect(x.summary).toBe(base.assessment.summary);
    expect(x.editorial_review_pending).toBe(true);
    expect(x.quality.narrative).toBe("too_short");
  });
  it("rejects both empty/short/over-large fields, with no publisher headline fallback", () => {
    for (const x of [
      { narrative: "...", summary: "..." },
      { narrative: null, summary: null },
      { narrative: "x".repeat(4001), summary: "x".repeat(4001) },
    ]) expect(() => preparePrivateDerivedText(x)).toThrow("PRIVATE_SCORING_DERIVED_BOTH_FIELDS_INVALID");
    expect(classifyPrivateDerivedTextQuality({ narrative: "...", summary: null })).toMatchObject({
      narrative: "too_short", summary: "missing", has_any_substantive_classifier_text: false,
    });
  });
  it("rejects control chars even when another field is substantive", () => {
    expect(() => preparePrivateDerivedText({
      narrative: "Control" + String.fromCharCode(1) + " in a sentence",
      summary: base.assessment.summary,
    })).toThrow("PRIVATE_SCORING_DERIVED_CONTROL_INVALID");
  });
  it("does not weaken source identity, category, signing version or severity gates", () => {
    expect(() => makePrivateStageRecord({
      ...base, assessment: { ...base.assessment, classificationVersion: "live-risk-score-v1.3.1" },
    })).toThrow("PRIVATE_SCORING_CANONICAL_ADMISSION_INVALID");
    expect(() => makePrivateStageRecord({
      ...base, assessment: { ...base.assessment, severity: 130 },
    })).toThrow("PRIVATE_SCORING_SCORE_INVALID");
    expect(() => makePrivateStageRecord({
      ...base, article: { ...base.article, url: "http://publisher.example.org/not-authorized" },
    })).toThrow("PRIVATE_SCORING_SOURCE_URL_INVALID");
  });
  it("uploads counters only, with a single bounded PR-merge production canary", () => {
    const summarize = readFileSync("scripts/ops/summarize-restricted-private-scoring.mjs", "utf8");
    const workflow = readFileSync(".github/workflows/restricted-private-current-scoring.yml", "utf8");
    const ingest = readFileSync("scripts/ingest-news.js", "utf8");
    const diag = readFileSync("scripts/lib/restricted-private-scoring-diagnostics.mjs", "utf8");
    expect(summarize).toContain("derived_quality_rejections: safeReasons");
    expect(summarize).toContain("editorial_review_pending_count");
    expect(ingest).toContain("classifyPrivateDerivedTextQuality(assessment)");
    expect(ingest).toContain("privateDiagnostic.editorial_review_pending_count++");
    expect(diag).toContain("PRIVATE_SCORING_DERIVED_BOTH_FIELDS_INVALID");
    expect(workflow).toContain("Merge #1831");
    expect(workflow).toContain("diagnostics-summary.json");
    expect(workflow).not.toContain("schedule:");
  });
});
