import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("production payment next-plan boundary", () => {
  it("requires real-money production rails and separates them from testnet proof", () => {
    const plan = read("docs/PRODUCTION_PAYMENT_NEXT_PLAN.md");

    expect(plan).toContain("real-money production payment rails only");
    expect(plan).toContain("INR-denominated payment");
    expect(plan).toContain("USD-denominated payment");
    expect(plan).toContain("multiple production blockchains");
    expect(plan).toContain("No testnet transaction is a commercial payment");
  });

  it("keeps Geomacro out of unnecessary custody and payment-intermediary roles", () => {
    const plan = read("docs/PRODUCTION_PAYMENT_NEXT_PLAN.md");

    expect(plan).toContain("Merchant-not-intermediary architecture");
    expect(plan).toContain("wallet custodian");
    expect(plan).toContain("no customer private keys or seed phrases handled by Geomacro");
    expect(plan).toContain("server-side verification of provider payment status");
    expect(plan).toContain("webhook signature verification");
  });

  it("treats credits as product entitlements rather than money", () => {
    const plan = read("docs/PRODUCTION_PAYMENT_NEXT_PLAN.md");

    expect(plan).toContain("Credits are a product-usage accounting unit, not money");
    expect(plan).toContain("credits are not cash-redeemable");
    expect(plan).toContain("raw data access remains prohibited regardless of credit balance");
  });
});
