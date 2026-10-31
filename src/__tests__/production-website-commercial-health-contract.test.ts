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

  it("verifies store and coming-soon promises against checked-out source", () => {
    const notice = read("src/components/api-keys-notice.tsx");
    const schedule = read("src/components/capability-price-schedule.tsx");
    for (const phrase of ["Geomacro Store", "LowBarrierPricing", "ApiKeysNotice", "CategoryApiPricing"]) {
      expect(job).toContain(phrase);
      expect(pricing).toContain(phrase);
    }
    expect(pricing).not.toContain("<CapabilityPriceSchedule />");
    expect(job).toContain("CategoryApiPricing");
    expect(job).toContain("GEOMACRO_CAPABILITY_PRICES.intelligence_query");
    expect(job).toContain("Self-service access and checkout are not open yet.");
    expect(notice).toContain("Self-service access and checkout are not open yet.");
    expect(job).toContain("Each exact request must qualify before payment.");
    expect(schedule).toContain("Each exact request must qualify before payment.");
    expect(job).toContain("Unavailable, stale or unqualified results are not chargeable.");
    expect(schedule).toContain("Unavailable, stale or unqualified results are not chargeable.");
  });

  it("continues fail-closed checks on live APIs, published SHA and mobile", () => {
    expect(job).toContain("Verify live build marker matches canonical main");
    expect(job).toContain("Verify public production APIs and current Intelligence contract");
    expect(job).toContain("Verify Ask Geomacro desktop and mobile rendering contract");
    expect(job).toContain("Verify live D1 control plane and fail-closed auth");
  });
});
