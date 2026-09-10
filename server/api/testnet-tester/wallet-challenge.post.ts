import { createError, defineEventHandler, readBody, setResponseHeaders } from "h3";

import { issueTestnetWalletChallenge } from "../../../src/lib/testnet-tester-account.server";
import { requireTesterPrincipal } from "../../../src/lib/testnet-tester-http.server";

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  const session = await requireTesterPrincipal(event);
  const body = await readBody<Record<string, unknown>>(event);
  try {
    const challenge = await issueTestnetWalletChallenge({
      principalId: session.principalId,
      walletAddress: String(body?.wallet_address ?? ""),
    });
    return { ok: true, data: challenge };
  } catch (error) {
    const code = error instanceof Error ? error.message : "WALLET_CHALLENGE_FAILED";
    throw createError({ statusCode: 400, statusMessage: code.slice(0, 120) });
  }
});
