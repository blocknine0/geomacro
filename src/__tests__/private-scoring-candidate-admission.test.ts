import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  privatePublisherPreAdmission, privateSingleDomainCandidateLimit,
} from "../../scripts/lib/private-scoring-candidate-admission.mjs";
import {
  emptyPrivateScoringDiagnostic, sanitizedDiagnosticSummary, addDiagnosticCount,
} from "../../scripts/lib/restricted-private-scoring-diagnostics.mjs";

const now = new Date("2026-10-09T12:00:00.000Z");
const article = {
  url: "https://publisher.example.org/macro/world-policy-change",
  sourceDomain: "publisher.example.org",
  title: "Central bank unexpectedly changes interest rate policy",
  publishedAt: "2026-10-09T11:40:00.000Z",
};
const admit = (changes: Record<string, unknown> = {}) =>
  privatePublisherPreAdmission({ ...article, ...changes }, { now });

describe("#1827 bounded first-party publisher identity before expensive classification", () => {
  it("accepts valid article transport without granting commercial or public rights", () => {
    expect(admit()).toEqual({ ok: true, reason: "transport_admitted" });
  });

  it("drops HTTP, credential URLs, localhost/IP, long and fabricated publisher URLs", () => {
    for (const url of [
      "http://publisher.example.org/macro/world-policy-change",
      "https://user:pass@publisher.example.org/macro",
      "https://127.0.0.1/macro", "https://localhost/macro",
      "http://169.254.169.254/metadata", "not-a-real-url",
      "https://publisher.example.org/" + "x".repeat(2200),
    ]) expect(admit({ url }).ok).toBe(false);
  });

  it("rejects hostname mismatch, missing title and fake publisher date", () => {
    expect(admit({ sourceDomain: "adversary.example.org" }).reason)
      .toBe("publisher_domain_mismatch");
    expect(admit({ title: "Breaking" }).reason).toBe("publisher_title_missing");
    expect(admit({ publishedAt: "" }).reason).toBe("publisher_time_unavailable");
    expect(admit({ publishedAt: "2026-10-08T10:00:00Z" }).reason)
      .toBe("publisher_time_unavailable");
    expect(admit({ publishedAt: "2026-10-09T12:07:00Z" }).reason)
      .toBe("publisher_time_unavailable");
  });

  it("reserves one classifier retry at a hard cap of 3 in each single-domain process", () => {
    expect(privateSingleDomainCandidateLimit({
      requestBudget: 3, batchSize: 1, maxCandidates: 2, privateMode: true,
    })).toBe(2);
    expect(privateSingleDomainCandidateLimit({
      requestBudget: 3, batchSize: 1, maxCandidates: 2, privateMode: false,
    })).toBe(1);
    expect(() => privateSingleDomainCandidateLimit({
      requestBudget: 1, batchSize: 1, maxCandidates: 2, privateMode: true,
    })).toThrow("PRIVATE_SCORING_BOUNDED_BUDGET_INVALID");
    expect(privateSingleDomainCandidateLimit({
      requestBudget: 100, batchSize: 1, maxCandidates: 2, privateMode: true,
    })).toBe(2);
  });

  it("preserves rejected URL counts without leaking any source URLs or titles", () => {
    const row = emptyPrivateScoringDiagnostic("macro");
    const reason = admit({ url: "http://publisher.example.org/secret" }).reason;
    addDiagnosticCount(row.preclassification_rejections, reason);
    const diagnostics = ["geopolitics", "macro", "rare_earth"].map(domain =>
      domain === "macro" ? row : emptyPrivateScoringDiagnostic(domain));
    const summary = sanitizedDiagnosticSummary(diagnostics);
    expect(summary.status).toBe("BLOCKED_NO_QUALIFIED_CANONICAL_SCORES");
    expect(row.preclassification_rejections.publisher_url_invalid).toBe(1);
    expect(JSON.stringify(summary)).not.toContain("example.org");
  });

  it("keeps existing strict category/severity scoring gates, zero-cost workflow and one-shot trigger", () => {
    const workflow = readFileSync(".github/workflows/restricted-private-current-scoring.yml", "utf8");
    const source = readFileSync("scripts/ingest-news.js", "utf8");
    const summary = readFileSync("scripts/ops/summarize-restricted-private-scoring.mjs", "utf8");
    expect(source).toContain("privatePublisherPreAdmission(article");
    expect(source).toContain("privateSingleDomainCandidateLimit({");
    expect(source).toContain("return admitPrivate(fallback)");
    expect(source).toContain("privateDiagnostic.preclassification_rejections");
    expect(source).toContain("if (PRIVATE_B2_STAGE)");
    expect(source).toContain("const gated = passesGates(article, assessment, category.name)");
    expect(source).toContain("makePrivateStageRecord({");
    expect(summary).toContain("preclassification_rejections: safeReasons");
    expect(workflow).toContain('GROQ_MAX_REQUESTS_PER_RUN: "3"');
    expect(workflow).toContain('MAX_CANDIDATES_PER_CATEGORY: "2"');
    expect(workflow).toContain("contains(github.event.head_commit.message, 'Merge #1831')");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).not.toContain("SUPABASE_DB_URL: ${{ secrets.");
  });
});
