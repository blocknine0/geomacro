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

  it("accepts ONLY the exact verified www. discovery alias but binds the real HTTPS URL hostname", () => {
    expect(admit({
      url: "https://www.publisher.example.org/2026/10/09/policy",
      sourceDomain: "publisher.example.org",
    })).toEqual({ ok: true, reason: "transport_admitted" });
    expect(admit({
      url: "https://www.evilpublisher.example.org/2026/10/09/policy",
      sourceDomain: "publisher.example.org",
    }).reason).toBe("publisher_domain_mismatch");
    expect(admit({
      url: "https://blog.publisher.example.org/2026/10/09/policy",
      sourceDomain: "publisher.example.org",
    }).reason).toBe("publisher_domain_mismatch");
    expect(admit({
      url: "http://www.publisher.example.org/2026/10/09/policy",
      sourceDomain: "publisher.example.org",
    }).reason).toBe("publisher_url_invalid");
    const ingest = readFileSync("scripts/ingest-news.js", "utf8");
    expect(ingest).toContain("sourceDomain: new URL(article.url).hostname.toLowerCase()");
  });

  it("qualifies only first-party native published PRIVATE evidence before model spend", () => {
    const native = {
      ...article, discoveryProvider: "official_native_rss",
      nativePublishedAtVerified: true, privateOnly: true,
      rightsVerified: false, commercialEligible: false,
    };
    const check = (patch: Record<string, unknown> = {}) =>
      privatePublisherPreAdmission({...native, ...patch}, {
        now, freshnessMs: 6 * 60 * 60 * 1000,
        requireOriginalPublisherProof: true,
      });
    expect(check()).toEqual({ok:true,reason:"transport_admitted"});
    for(const invalid of [
      {discoveryProvider:"gdelt"},
      {discoveryProvider:"guardian"},
      {nativePublishedAtVerified:false},
      {nativePublishedAtVerified:undefined},
      {privateOnly:false},
      {rightsVerified:true},
      {commercialEligible:true},
      {rightsVerified:undefined},
      {commercialEligible:undefined},
    ]) {
      expect(check(invalid)).toEqual({
        ok:false,reason:"publisher_native_publication_unverified",
      });
    }
    expect(check({publishedAt:"2026-10-09T12:01:00Z"}).reason)
      .toBe("publisher_time_unavailable");
    expect(check({publishedAt:"2026-10-09T05:59:00Z"}).reason)
      .toBe("publisher_time_unavailable");
    expect(check({url:"https://publisher.example.org.evil.test/event"}).reason)
      .toBe("publisher_domain_mismatch");
    const summary = JSON.stringify(check());
    expect(summary).not.toContain("publisher.example.org");
    expect(summary).not.toContain(article.title);
  });

  it("routes the official source-native gate into private scorer without changing no-payment or paid promotion gates", () => {
    const ingest=readFileSync("scripts/ingest-news.js","utf8");
    expect(ingest).toContain("requireOriginalPublisherProof: true");
    expect(ingest).toContain("privateDiagnostic.preclassification_rejections");
    expect(ingest).toContain("if (PRIVATE_B2_STAGE)");
    expect(ingest).toContain("makePrivateStageRecord({");
    const stage=readFileSync("scripts/lib/restricted-private-scored-stage.mjs","utf8");
    expect(stage).toContain("rights_verified: false");
    expect(stage).toContain("independently_corroborated: false");
    expect(stage).toContain("public_eligible: false");
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
    addDiagnosticCount(row.preclassification_rejections, "domain_anchor_missing");
    expect(row.preclassification_rejections.domain_anchor_missing).toBe(1);
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
    expect(summary).toContain("domain_anchor_missing");
    expect(workflow).toContain('GROQ_MAX_REQUESTS_PER_RUN: "3"');
    expect(workflow).toContain('MAX_CANDIDATES_PER_CATEGORY:');
    expect(workflow).toContain('MAX_CANDIDATES_PER_CATEGORY: "1"');
    expect(workflow).toContain("private_gri_singleton:");
    expect(workflow).toContain("contains(github.event.head_commit.message, 'Merge pull request #1891')");
    expect(workflow).toContain("github.event.inputs.private_gri_singleton == 'true'");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).not.toContain("SUPABASE_DB_URL: ${{ secrets.");
  });
});
