import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dual-rail checkout email OTP and payment isolation", () => {
  const source = readFileSync("src/components/dual-rail-checkout.tsx", "utf8");

  it("keeps Send verification code and Verify email independent of checkoutEnabled", () => {
    expect(source).toContain("disabled={busy} onClick={()=>void safely(startEmailVerification)}");
    expect(source).toContain("disabled={busy||otp.length!==6} onClick={()=>void safely(verifyEmail)}");
    expect(source).not.toContain("disabled={busy||!checkoutEnabled} onClick={()=>void safely(startEmailVerification)}");
    expect(source).not.toContain("disabled={busy||otp.length!==6||!checkoutEnabled} onClick={()=>void safely(verifyEmail)}");
  });

  it("preserves checkoutEnabled gates for wallet binding and USDC payment", () => {
    expect(source).toContain("disabled={busy||!checkoutEnabled||!user||!connectedProvider} onClick={()=>void safely(connectAndBindWallet)}");
    expect(source).toContain("{checkoutEnabled&&walletAddress&&user&&<div");
  });
});
