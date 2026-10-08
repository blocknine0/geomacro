import { describe, expect, it } from "vitest";
import { derivedPublicGist, sanitizePublicIntelligenceRow } from "./public-intelligence-gist";
import type { PublicIntelligenceRow } from "./public-intelligence.functions";

const base: PublicIntelligenceRow = {
  id: "b2-verified-1",
  source_title: "Geomacro finds The Federal Reserve changed policy because inflation remains persistent and the move is a material macroeconomic development involving forward funding conditions",
  summary: "Federal Reserve policy change increases funding pressure",
  category: "macro",
  severity: 80,
  delta: 9,
  created_at: "2026-10-08T06:00:00Z",
  published_at: "2026-10-08T05:00:00Z",
  public_status: "verified_b2",
};

describe("Geomacro public gist and no-raw projection", () => {
  it("prefers already derived short summary over verbose classifier rationale", () => {
    expect(derivedPublicGist(base.source_title, base.summary, "verified_b2"))
      .toBe("Geomacro finds Federal Reserve policy change increases funding pressure");
  });

  it("never publishes editorial naming or upstream full text", () => {
    const article = { ...base, source_title: "Geomacro finds The article describes a situation", summary: "An export rule raises supply concerns" };
    const output = sanitizePublicIntelligenceRow(article);
    expect(output?.source_title).toBe("Geomacro finds An export rule raises supply concerns");
    expect(JSON.stringify(output)).not.toMatch(/\barticle\b/iu);
    expect(sanitizePublicIntelligenceRow({ ...article, summary: null })).toBeNull();
  });

  it("allowlists public fields and rejects raw payload/identity leaks", () => {
    const row = {
      ...base,
      raw_payload: { private: "not for clients" },
      source_url: "https://upstream.invalid/private",
      source_name: "restricted publisher",
      provenance: { contract: "secret" },
      provider_id: "provider-private",
    };
    const safe = sanitizePublicIntelligenceRow(row);
    expect(safe && Object.keys(safe).sort()).toEqual([
      "category", "created_at", "delta", "id", "public_status",
      "published_at", "severity", "source_title", "summary",
    ].sort());
    const payload = JSON.stringify(safe);
    for (const phrase of ["not for clients", "upstream.invalid", "restricted publisher", "provider-private", "secret"]) {
      expect(payload).not.toContain(phrase);
    }
  });

  it("keeps observation-only rows unscored with a single verified gist", () => {
    const out = sanitizePublicIntelligenceRow({
      ...base,
      id: "observed",
      category: "geopolitics",
      source_title: "Geomacro observes cross-border tension in a monitored region",
      summary: "Extra observation context",
      severity: null,
      delta: null,
      public_status: "live_observed",
    });
    expect(out?.source_title).toBe("Geomacro observes cross-border tension in a monitored region");
    expect(out?.summary).toBeNull();
    expect(out?.severity).toBeNull();
  });

  it("rejects unapproved, malformed and upstream direct headlines", () => {
    expect(sanitizePublicIntelligenceRow({ ...base, source_title: "Unverified publisher headline" })).toBeNull();
    expect(sanitizePublicIntelligenceRow({ ...base, source_title: "Geomacro finds https://upstream.invalid/private", summary: null })).toBeNull();
    expect(sanitizePublicIntelligenceRow({ ...base, public_status: "live_observed", severity: 80 })).toBeNull();
  });
});
