import { createError, defineEventHandler, readBody, setResponseHeaders } from "h3";

import { verifyTestnetWalletSignature } from "../../../src/lib/testnet-tester-account.server";
import { requireTesterPrincipal } from "../../../src/lib/testnet-tester-http.server";

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  const session = await requireTesterPrincipal(event);
  const body = await readBody<Record<string, unknown>>(event);
  try {
    const result = await verifyTestnetWalletSignature({
      principalId: session.principalId,
      walletAddress: String(body?.wallet_address ?? ""),
      nonce: String(body?.nonce ?? ""),
      message: String(body?.message ?? ""),
      signature: String(body?.signature ?? ""),
    });
    return { ok: true, data: result };
  } catch (error) {
    const code = error instanceof Error ? error.message : "WALLET_VERIFICATION_FAILED";
    throw createError({ statusCode: 400, statusMessage: code.slice(0, 120) });
  }
});
