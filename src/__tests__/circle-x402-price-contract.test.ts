import { describe, expect, it } from "vitest";
import {
  CIRCLE_X402_ASSET,
  CIRCLE_X402_NETWORK,
  CIRCLE_X402_PRICE_ATOMIC,
  CIRCLE_X402_PRICE_USDC,
} from "../lib/circle-x402.server";

describe("Circle x402 Arc Testnet price contract", () => {
  it("pins the technical-proof price to 0.05 USDC", () => {
    expect(CIRCLE_X402_PRICE_USDC).toBe("0.05");
    expect(CIRCLE_X402_PRICE_ATOMIC).toBe("50000");
  });

  it("pins the payment rail to Arc Testnet Gateway USDC", () => {
    expect(CIRCLE_X402_NETWORK).toBe("eip155:5042002");
    expect(CIRCLE_X402_ASSET).toBe(
      "0x3600000000000000000000000000000000000000",
    );
  });
});
