import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("transparent customer dashboard and account ledger", () => {
  it("exposes wallets, payment receipts, and usage history in customer account runtime", () => {
    const runtime = readFileSync("workers/control-plane/src/customer-runtime.mjs", "utf8");
    expect(runtime).toContain("customer_wallet_addresses");
    expect(runtime).toContain("customer_payment_receipts");
    expect(runtime).toContain("customer_usdc_pack_transfers");
    expect(runtime).toContain("customer_store_risk_gate_usage");
    expect(runtime).toContain("customer_usage_receipts");
    expect(runtime).toContain("wallets:wallets.results??[]");
    expect(runtime).toContain("payments:payments.results??[]");
  });

  it("renders linked wallets, verified payments, and usage history on /dashboard", () => {
    const dash = readFileSync("src/routes/dashboard.tsx", "utf8");
    expect(dash).toContain("Linked self-custody wallets");
    expect(dash).toContain("Verified payments &amp; USDC receipts");
    expect(dash).toContain("API &amp; Risk Gate usage history");
    expect(dash).toContain("account.wallets");
    expect(dash).toContain("account.payments");
    expect(dash).toContain("account.usage");
  });
});
