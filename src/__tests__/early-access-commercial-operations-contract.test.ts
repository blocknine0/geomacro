import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const operating = read("docs/EARLY_ACCESS_OPERATING_TERMS.md");
const pricing = read("docs/FOUNDING_PILOT_PRICING_GUARDRAILS.md");
const india = read("docs/INDIA_B2B_PACKAGE.md");
const sow = read("docs/INDIA_PILOT_SOW_TEMPLATE.md");
const earlyAccessScope = read("docs/COMMERCIAL_EARLY_ACCESS_SCOPE.md");
const publicAvailability = read("src/content/docs/49-commercial-availability.md");

describe("Early Access commercial operating contract", () => {
  it("keeps the founding-pilot price anchors aligned with existing founder guardrails", () => {
    expect(operating).toContain("USD 1,500");
    expect(operating).toContain("USD 2,500");
    expect(operating).toContain("USD 750");
    expect(pricing).toContain("USD 1,500 for 30 days");
    expect(pricing).toContain("USD 2,500 for 30 days");
    expect(pricing).toContain("USD 750");
    expect(india).toContain("INR 125,000 for 30 days");
    expect(india).toContain("INR 210,000 for 30 days");
  });

  it("defines a bounded founder-support model without silently creating an SLA", () => {
    expect(operating).toContain("contact@geomacro.live");
    expect(operating).toContain("10:00 to 18:00 Asia/Kolkata");
    expect(operating).toContain("not 24/7 support");
    expect(operating).toContain("not contractual response-time SLAs");
    for (const term of [
      "uptime percentage",
      "latency guarantee",
      "throughput guarantee",
      "RTO",
      "RPO",
      "24/7 monitoring or on-call coverage",
    ]) {
      expect(operating).toContain(term);
    }
    expect(sow).toContain("does not include a general production uptime SLA");
    expect(sow).toContain("guaranteed response time, RTO or RPO");
  });

  it("locks incident, fail-closed and execution boundaries", () => {
    expect(operating).toContain("### Critical incident");
    expect(operating).toContain("### High incident");
    expect(operating).toContain("### Moderate incident / degradation");
    expect(operating).toContain("execution_authorized=false");
    expect(operating).toContain("A suspension is preferable to silently serving unverified or ineligible intelligence");
    expect(operating).toContain("ALLOW` is not transaction permission or compliance clearance");
  });

  it("keeps customer-use, source-rights and legal-contract limits explicit", () => {
    expect(operating).toContain("Source rights, attribution and redistribution");
    expect(operating).toContain("Customer-use boundary");
    expect(operating).toContain("Legal-contract boundary");
    expect(operating).toContain("not a complete legal contract and not legal advice");
    expect(operating).toContain("limited, non-exclusive, non-transferable right");
    expect(operating).toContain("Third-party raw source rights are not transferred");
  });

  it("keeps controlled-pilot terms internal rather than exposing list pricing as public GA", () => {
    expect(operating).toContain("not general public pricing");
    expect(operating).toContain("not general availability");
    expect(publicAvailability).not.toContain("USD 1,500");
    expect(publicAvailability).not.toContain("USD 2,500");
    expect(earlyAccessScope).toContain("Canonical commercial source of truth");
  });
});
