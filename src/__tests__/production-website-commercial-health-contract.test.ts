import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("production website health validates real commercial promises", () => {
  const job = read(".github/workflows/production-website-health.yml");
  const pricing = read("src/routes/pricing.tsx");
  const intelligence = read("src/routes/intelligence.tsx");
  const guide = read("src/components/commercial-access-guide.tsx");

  it("accepts current customer-facing text without relaxing evidence-time truth", () => {
    expect(job).toContain("function latestOriginalEvidenceAt(rows: IntelEvent[]): number | null");
    expect(job).toContain("setUpdatedAt(latestOriginalEvidenceAt(next.all));");
    expect(job).toContain("setUpdatedAt(Date.now())");
    expect(job).toContain("Earlier assessments retain their original dates.");
    expect(intelligence).toContain("Earlier assessments retain their original dates.");
    expect(job).not.toContain("Score dates remain the original verified evidence times.");
  });

  it("verifies truthful free, x402 and monthly access against checked-out source", () => {
    for (const phrase of [
      "Explore for free. Choose the access that fits.",
      "Pay-per-call availability is confirmed by the live checkout, not the advertised price.",
      "Coming Soon · Monthly checkout",
      "Monthly subscriptions are Coming Soon. You can request a tailored plan and quote now.",
      "Request monthly access",
    ]) {
      expect(job).toContain(phrase);
      expect(pricing).toContain(phrase);
    }
    expect(job).toContain("Structured intelligence for APIs and AI agents");
    expect(guide).toContain("Structured intelligence for APIs and AI agents");
    expect(job).toContain("Coming Soon · enquiries open");
    expect(guide).toContain("Coming Soon · enquiries open");
    expect(job).toContain("Monthly subscription checkout is Coming Soon; plan enquiries are open.");
    expect(guide).toContain("Monthly subscription checkout is Coming Soon; plan enquiries are open.");
    expect(job).toContain("Request monthly access");
    expect(guide).toContain("Request monthly access");
    expect(job).toContain("Failed, stale, unavailable, replayed, refunded, internal and unpaid requests do not count as successful paid deliveries.");
  });

  it("continues fail-closed checks on live APIs, published SHA and mobile", () => {
    expect(job).toContain("Verify live build marker matches canonical main");
    expect(job).toContain("Verify public production APIs and current Intelligence contract");
    expect(job).toContain("Verify Ask Geomacro desktop and mobile rendering contract");
    expect(job).toContain("Verify live D1 control plane and fail-closed auth");
  });
});
