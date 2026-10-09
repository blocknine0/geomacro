import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  makePrivateStageRecord,
  makePrivateStageBundle,
  validatePrivateStageBundle,
  CANONICAL_CLASSIFIER_VERSION,
} from "../../scripts/lib/restricted-private-scored-stage.mjs";

const now = new Date("2026-10-09T06:00:00.000Z");
const article = {
  url: "https://publisher.example.org/world/real-developments",
  sourceDomain: "publisher.example.org",
  title: "Material cross-border sanctions policy and shipping disruption",
  publishedAt: "2026-10-09T05:40:00.000Z",
};
const assessment = {
  relevant: true,
  category: "geopolitics",
  ungrounded: false,
  severity: 67,
  confidence: 83,
  narrative: "New restrictions threaten cross-border shipment continuity.",
  summary: "Verified activity is associated with elevated bilateral trade risk.",
  classificationProvider: "groq",
  classificationModel: "example-model",
  classificationVersion: CANONICAL_CLASSIFIER_VERSION,
  classificationPromptVersion: "risk-desk-filter-v1.0.5",
  classificationInputHash: "a".repeat(64),
};
const make = (overrides: Record<string, unknown> = {}) =>
  makePrivateStageRecord({
    article: { ...article, ...(overrides.article as object ?? {}) },
    assessment: { ...assessment, ...(overrides.assessment as object ?? {}) },
    category: (overrides.category as string) ?? "geopolitics",
    now,
  });

describe("#1803 restricted canonical private score archive", () => {
  it("retains actual existing classifier/version/input proof but never grants public rights", () => {
    const row = make();
    expect(row.severity).toBe(67);
    expect(row.confidence).toBe(83);
    expect(row.classifier.input_sha256).toBe("a".repeat(64));
    expect(row.observed_at).toBe(article.publishedAt);
    expect(row.public_eligible).toBe(false);
    expect(row.rights_verified).toBe(false);
    expect(row.independently_corroborated).toBe(false);
    expect(row.private_source.source_url).toBe(article.url);
    expect(JSON.stringify(row)).not.toContain(article.title);
    const stage = makePrivateStageBundle([row], { now });
    expect(stage.counts).toEqual({ geopolitics: 1, macro: 0, rare_earth: 0 });
    expect(stage.raw_data_delivered).toBe(false);
    expect(stage.public_eligible).toBe(false);
    expect(validatePrivateStageBundle(stage, { now }).rows[0].id).toBe(row.id);
  });

  it("fails closed on synthetic, invalid and cross-category scoring", () => {
    expect(() => make({ assessment: { classificationVersion: "live-risk-score-v1.3.1" } }))
      .toThrow("PRIVATE_SCORING_CANONICAL_ADMISSION_INVALID");
    expect(() => make({ assessment: { category: "macro" } }))
      .toThrow("PRIVATE_SCORING_CANONICAL_ADMISSION_INVALID");
    expect(() => make({ assessment: { ungrounded: true } }))
      .toThrow("PRIVATE_SCORING_CANONICAL_ADMISSION_INVALID");
    expect(() => make({ assessment: { classificationInputHash: null } }))
      .toThrow("PRIVATE_SCORING_CLASSIFIER_PROVENANCE_INVALID");
    expect(() => make({ assessment: { severity: 102 } }))
      .toThrow("PRIVATE_SCORING_SCORE_INVALID");
    expect(() => make({ assessment: { severity: -1 } }))
      .toThrow("PRIVATE_SCORING_SCORE_INVALID");
  });

  it("rejects ungrounded publisher identity, stale and future evidence timestamps", () => {
    expect(() => make({ article: { url: "http://publisher.example.org/item" } }))
      .toThrow("PRIVATE_SCORING_SOURCE_URL_INVALID");
    expect(() => make({ article: { sourceDomain: "fake.example.org" } }))
      .toThrow("PRIVATE_SCORING_ORIGINAL_PUBLISHER_UNVERIFIED");
    expect(() => make({ article: { publishedAt: "2026-10-01T00:00:00Z" } }))
      .toThrow("PRIVATE_SCORING_ORIGINAL_PUBLISH_TIME_INVALID");
    expect(() => make({ article: { publishedAt: "2026-10-09T06:10:00Z" } }))
      .toThrow("PRIVATE_SCORING_ORIGINAL_PUBLISH_TIME_INVALID");
  });

  it("detects duplicate or tainted stage records, not a customer projection", () => {
    const row = make();
    expect(() => makePrivateStageBundle([row, row], { now }))
      .toThrow("PRIVATE_SCORING_STAGE_DUPLICATE");
    expect(() => makePrivateStageBundle([{ ...row, public_eligible: true }], { now }))
      .toThrow("PRIVATE_SCORING_STAGE_ROW_INVALID");
    const stage = makePrivateStageBundle([row], { now });
    expect(() => validatePrivateStageBundle({ ...stage, counts: { macro: 1 } }, { now }))
      .toThrow("PRIVATE_SCORING_STAGE_BINDING_INVALID");
    expect(() => validatePrivateStageBundle({ ...stage, rights_verification_pending: false }, { now }))
      .toThrow("PRIVATE_SCORING_STAGE_CONTRACT_INVALID");
  });

  it("isolates staging from Supabase and public projections, with one verified B2 GET", () => {
    const workflow = readFileSync(".github/workflows/restricted-private-current-scoring.yml", "utf8");
    const scorer = readFileSync("scripts/ingest-news.js", "utf8");
    const archive = readFileSync("scripts/ops/archive-restricted-private-scored-stage.mjs", "utf8");
    const client = readFileSync("scripts/ops/b2-s3-client.mjs", "utf8");
    expect(workflow).toContain("workflow_dispatch: {}");
    expect(workflow).toContain("contains(github.event.head_commit.message, 'Merge #1833')");
    expect(workflow).toContain(".github/workflows/restricted-private-current-scoring.yml");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).not.toContain("workflow_run:");
    expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.");
    expect(workflow).toContain('B2_REQUEST_BUDGET: "6"');
    expect(workflow).toContain("for domain in geopolitics macro rare_earth");
    expect(workflow).toContain("--private-scored-stage");
    expect(workflow).toContain("--private-stage-only");
    expect(scorer).toContain("PRIVATE_B2_STAGE ? null : createClient");
    expect(scorer).toContain("if (!PRIVATE_B2_STAGE) {");
    expect(scorer).toContain("if (!PRIVATE_B2_STAGE) try");
    expect(scorer).toContain("privateStagedRows.push(staged)");
    expect(archive).toContain("PRIVATE_SCORING_SUPABASE_CREDENTIALS_FORBIDDEN");
    expect(archive).toContain("putWithMetadataVerification(key, packed, {");
    expect(archive).toContain("validatePrivateStageBundle(parsed);");
    expect(archive).toContain("b2_exact_gzip_restore_verified: true");
    expect(archive).toContain("publication_authorized: false");
    expect(archive).toContain("supabase_writes: 0");
    expect(archive).toContain("public_published: false");
    expect(client).toContain("await verifyRestored(readback)");
    expect(client).not.toContain("const secondReadback =");
  });
});
