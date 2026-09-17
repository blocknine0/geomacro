import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const HOME = readFileSync("src/components/home/commercial-home.tsx", "utf8");
const RISK_GATE = readFileSync("src/routes/risk-gate.tsx", "utf8");
const INSTITUTIONAL = readFileSync("src/routes/institutional.tsx", "utf8");

describe("Risk Gate commercial control ordering", () => {
  it("keeps detailed Risk Gate mechanics off the 40-second commercial homepage", () => {
    expect(HOME).toContain("Risk Gate + signed Risk Objects");
    expect(HOME).toContain("controlled Private Pilot");
    expect(HOME).not.toContain("Planned controlled workflow");
    expect(HOME).not.toContain("Risk Gate recommendation returned");
    expect(HOME).not.toContain("Customer policy decides what happens next");
  });

  it("keeps Risk Gate response before customer policy and customer-controlled execution on the dedicated buyer surfaces", () => {
    const gateResponse = INSTITUTIONAL.indexOf("Risk Gate returns bounded decision context");
    const policy = INSTITUTIONAL.indexOf("The customer's own identity, permissions and policy layer applies its rules after the Risk Gate response");
    const execution = INSTITUTIONAL.indexOf("Any execution after that remains under the customer's control");

    expect(gateResponse).toBeGreaterThanOrEqual(0);
    expect(policy).toBeGreaterThan(gateResponse);
    expect(execution).toBeGreaterThan(policy);
    expect(RISK_GATE).toContain("execution_authorized = false");
    expect(RISK_GATE).toContain("A risk recommendation is not permission to move money");
  });
});
