import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  join(process.cwd(), "server/api/testnet/account.get.ts"),
  "utf8",
);

describe("Testnet account status runtime", () => {
  it("does not make credential/account validation depend on the payment receiver", () => {
    expect(route).toContain("function optionalTestnetUsdcReceiver");
    expect(route).toContain("return requireTestnetUsdcReceiver()");
    expect(route).toContain("return null");
    expect(route).toContain("configured: receiverAddress !== null");
    expect(route).toContain("receiver_address: receiverAddress");
  });

  it("resolves auth, entitlement and credits before reading optional payment config", () => {
    expect(route.indexOf('stage = "entitlement"')).toBeGreaterThan(
      route.indexOf("authenticateCommercialApiRequest"),
    );
    expect(route.indexOf('stage = "credit_account"')).toBeGreaterThan(
      route.indexOf('stage = "entitlement"'),
    );
    expect(route.indexOf('stage = "payment_config"')).toBeGreaterThan(
      route.indexOf("ensureCommercialCreditAccount"),
    );
  });

  it("keeps unexpected failures fail-closed without exposing internal errors", () => {
    expect(route).toContain('code: "TESTNET_ACCOUNT_UNAVAILABLE"');
    expect(route).toContain(
      'message: "Testnet API account status is temporarily unavailable."',
    );
    expect(route).toContain('console.error("[testnet-account-api] request failed"');
  });
});
