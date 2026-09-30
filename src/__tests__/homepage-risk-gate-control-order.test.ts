import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const HOME = readFileSync("src/components/home/commercial-home.tsx", "utf8");
const RISK_GATE = readFileSync("src/routes/risk-gate.tsx", "utf8");
const INSTITUTIONAL = readFileSync("src/routes/institutional.tsx", "utf8");

describe("Risk Gate commercial control ordering", () => {
  it("keeps detailed Risk Gate mechanics off the buyer-first homepage", () => {
    expect(HOME).toContain("Machine and commercial access lives in dedicated product surfaces with explicit availability and product boundaries.");
    expect(HOME).toContain("API & Agent Access");
    expect(HOME).not.toContain("Risk Gate recommendation returned");
    expect(HOME).not.toContain("Customer policy decides what happens next");
    expect(HOME).not.toContain("CONTINUE / REDUCE_LIMIT / REQUIRE_APPROVAL / PAUSE");
    expect(HOME).not.toContain("execution_authorized");
  });

  it("keeps Risk Gate non-authorizing while institutional copy treats automation as controlled progression", () => {
    expect(INSTITUTIONAL).toContain("Signed Risk Objects and Risk Gate");
    expect(INSTITUTIONAL).toContain("Risk Gate, paid agent/x402 production access and broader machine delivery remain roadmap or controlled capabilities until separately promoted");
    expect(INSTITUTIONAL).not.toContain("Risk Gate returns bounded decision context");
    expect(INSTITUTIONAL).not.toContain("CONTINUE");
    expect(RISK_GATE).toContain("execution_authorized = false");
    expect(RISK_GATE).toContain("Geomacro returns decision context; it does not sign, authorize or submit customer transactions.");
    expect(RISK_GATE).toContain("The customer keeps identity, permissions, policy enforcement and final execution.");
  });
});
