import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { summarizeFedericoRejection } from "../../scripts/ops/sanitize-federico-review-diagnostic.mjs";

describe("Federico rejected review diagnostics", () => {
  it("retains actionable review issue categories while redacting source URLs and credentials", () => {
    const source = JSON.stringify({
      status: "success",
      verdict: "reject",
      proof: { signature: "secret-review-proof" },
      external_evidence: { raw: "raw source material" },
      issues: [
        {
          severity: "blocker",
          category: "provenance",
          description:
            "Stable source https://example.org/secret?token=abcd is missing; contact someone@example.org. Bearer sensitive-token-value",
        },
        { severity: "high", category: "methodology", description: "Not independently reproducible" },
      ],
    });
    const report = summarizeFedericoRejection(source, "12345");
    expect(report.schema).toBe("geomacro.federico-redacted-review-diagnostic.v1");
    expect(report.verdict).toBe("reject");
    expect(report.issue_count).toBe(2);
    expect(report.issues[0].severity).toBe("blocker");
    expect(report.issues[1].category).toBe("methodology");
    expect(report.raw_review_response_sha256).toMatch(/^[a-f0-9]{64}$/);
    const output = JSON.stringify(report);
    expect(output).toContain("[redacted-url]");
    expect(output).toContain("[redacted-email]");
    expect(output).toContain("[redacted-auth]");
    expect(output).not.toContain("https://example.org");
    expect(output).not.toContain("someone@example.org");
    expect(output).not.toContain("sensitive-token-value");
    expect(output).not.toContain("secret-review-proof");
    expect(output).not.toContain("raw source material");
  });

  it("never publishes full reviewer response or GROs into public diagnostic artifacts", () => {
    const workflow = readFileSync(".github/workflows/day6-partner-assurance-final.yml", "utf8");
    const start = workflow.indexOf("Upload redacted Federico rejection diagnostics on failure");
    const end = workflow.indexOf("Record no-allowance mode", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const diagnostic = workflow.slice(start, end);
    expect(diagnostic).toContain("artifacts/day6-federico-review-diagnostic/redacted-review.json");
    expect(diagnostic).not.toContain("/tmp/day6-risk-object.json");
    expect(diagnostic).not.toContain("/tmp/federico-review-request.json");
    expect(diagnostic).not.toContain("/tmp/federico-review-response.json");
    expect(workflow).toContain("if: ${{ failure() && inputs.use_partner_allowance == true }}");
    expect(workflow).toContain("sanitiz" + "e-federico-review-diagnostic.mjs");
    expect(workflow).toContain(".live_review.verdict == \"approve\"");
    expect(workflow).toContain(".live_review.issue_count == 0");
  });
});
