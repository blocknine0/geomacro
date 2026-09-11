import { createError, defineEventHandler, readBody, setResponseHeaders } from "h3";

import { verifyTestnetWalletSignature } from "../../../src/lib/testnet-tester-account.server";
import { requireTesterPrincipal } from "../../../src/lib/testnet-tester-http.server";
import { activateWalletVerifiedTesterCredits } from "../../../src/lib/testnet-tester-wallet-credits.server";

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  const session = await requireTesterPrincipal(event);
  const body = await readBody<Record<string, unknown>>(event);
  try {
    const verification = await verifyTestnetWalletSignature({
      principalId: session.principalId,
      walletAddress: String(body?.wallet_address ?? ""),
      nonce: String(body?.nonce ?? ""),
      message: String(body?.message ?? ""),
      signature: String(body?.signature ?? ""),
    });
    const credits = await activateWalletVerifiedTesterCredits(session.principalId);
    return {
      ok: true,
      data: {
        ...verification,
        ...credits,
        wallet_verified: true,
        access_status: "active",
      },
      execution_authorized: false,
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : "WALLET_VERIFICATION_FAILED";
    throw createError({ statusCode: 400, statusMessage: code.slice(0, 120) });
  }
});
