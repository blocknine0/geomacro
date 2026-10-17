import { describe, expect, it } from "vitest";
import { riskState } from "./b2-agent-governed-modules.server";

const risk = (expiresAt: string) => ({
  module: "macro_monetary",
  score: 42,
  previous_score: 41,
  delta: 1,
  confidence: 0.8,
  coverage: "VERIFIED",
  commercial_eligibility_status: "VERIFIED",
  generated_at: new Date(Date.now() - 30 * 60_000).toISOString(),
  expires_at: expiresAt,
  methodology_version: "governed-structural-v1",
  drivers: [{
    driver: "annual_official_indicator",
    score_contribution: 0.5,
    delta_contribution: 0.2,
    confidence: 0.8,
  }],
});

describe("B2 governed module expiry", () => {
  it("admits a verified currently live derived module", () => {
    expect(riskState(risk(new Date(Date.now() + 60 * 60_000).toISOString()),
      "macro_monetary")).toBe(true);
  });

  it("never revives an expired module by rewrapping it in a fresh B2 snapshot", () => {
    const expired = risk(new Date(Date.now() - 60_000).toISOString());
    expect(riskState(expired, "macro_monetary")).toBe(false);
    expect(riskState({...expired, expires_at: new Date(Date.now()).toISOString()},
      "macro_monetary")).toBe(false);
  });

  it("rejects wrong modules and malformed state lifetime or source verification", () => {
    const live = risk(new Date(Date.now() + 60 * 60_000).toISOString());
    expect(riskState(live, "sovereign_fiscal")).toBe(false);
    expect(riskState({...live,commercial_eligibility_status:"PENDING"},
      "macro_monetary")).toBe(false);
    expect(riskState({...live,expires_at:"invalid"}, "macro_monetary")).toBe(false);
  });
});
