import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("testnet registration recovery", () => {
  it("surfaces bridge error payloads instead of hiding them behind a generic browser fallback", () => {
    const client = read("../../public/testnet-access.js");
    expect(client).toContain("payload?.error");
    expect(client).toContain("payload?.statusMessage");
    expect(client).toContain("payload?.data?.error");
  });

  it("keeps a created tester session even when verification email delivery fails", () => {
    const route = read("../../server/api/testnet-tester/register.post.ts");
    const cookieIndex = route.indexOf("setTesterSessionCookie(event, result.session_token)");
    const emailIndex = route.indexOf("await sendTestnetVerificationEmail");
    expect(cookieIndex).toBeGreaterThan(0);
    expect(emailIndex).toBeGreaterThan(cookieIndex);
    expect(route).toContain("email_verification_sent: false");
    expect(route).toContain("retry_available: true");
  });

  it("provides a session-authenticated resend path without exposing verification tokens", () => {
    const route = read("../../server/api/testnet-tester/email-resend.post.ts");
    const helper = read("../lib/testnet-email-recovery.server.ts");
    const bridge = read("../routes/api/testnet-tester/$.tsx");

    expect(route).toContain("requireTesterPrincipal");
    expect(route).toContain("issueTestnetEmailRecoveryChallenge");
    expect(route).toContain("sendTestnetVerificationEmail");
    expect(route).not.toContain("verification_token:");
    expect(helper).toContain("TESTNET_EMAIL_MISMATCH");
    expect(helper).toContain("email_hash");
    expect(bridge).toContain('"email-resend": emailResendPost');
  });

  it("lets the browser retry verification delivery from the authenticated account state", () => {
    const client = read("../../public/testnet-access.js");
    expect(client).toContain("Resend verification email");
    expect(client).toContain("/api/testnet-tester/email-resend");
    expect(client).toContain("geomacro_testnet_email");
  });
});
