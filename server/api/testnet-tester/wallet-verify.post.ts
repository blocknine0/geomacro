import { createError, defineEventHandler, readBody, setResponseHeaders } from "h3";

import { verifyTestnetWalletSignature } from "../../../src/lib/testnet-tester-account.server";
import { setTesterSessionCookie } from "../../../src/lib/testnet-tester-cookie.server";
import { requireTesterPrincipal } from "../../../src/lib/testnet-tester-http.server";
import { recoverExistingTestnetWalletAccount } from "../../../src/lib/testnet-wallet-account-recovery.server";

function publicWalletVerificationCode(error: unknown) {
  const raw = error instanceof Error ? error.message : "";
  if (/^[A-Z][A-Z0-9_]{2,119}$/.test(raw)) return raw;
  return "WALLET_VERIFICATION_FAILED";
}

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  const session = await requireTesterPrincipal(event);
  const body = await readBody<Record<string, unknown>>(event);
  const walletAddress = String(body?.wallet_address ?? "");
  const nonce = String(body?.nonce ?? "");
  const message = String(body?.message ?? "");
  const signature = String(body?.signature ?? "");

  try {
    try {
      const result = await verifyTestnetWalletSignature({
        principalId: session.principalId,
        walletAddress,
        nonce,
        message,
        signature,
      });
      return { ok: true, data: result };
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "TESTNET_WALLET_ALREADY_REGISTERED") {
        throw error;
      }
    }

    const recovered = await recoverExistingTestnetWalletAccount({
      principalId: session.principalId,
      sessionId: session.sessionId,
      walletAddress,
      nonce,
      message,
      signature,
    });
    setTesterSessionCookie(event, recovered.replacement_session_token);
    const { replacement_session_token: _privateSessionToken, ...publicRecovery } = recovered;
    return {
      ok: true,
      data: {
        verified: true,
        wallet_address: walletAddress.toLowerCase(),
        ...publicRecovery,
      },
    };
  } catch (error) {
    const code = publicWalletVerificationCode(error);
    throw createError({ statusCode: 400, statusMessage: code });
  }
});
