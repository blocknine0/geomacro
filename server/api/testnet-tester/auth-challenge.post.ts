import { createError, defineEventHandler, readBody, setResponseHeaders } from "h3";

import { assertTestnetAuthSameOrigin } from "../../../src/lib/testnet-origin-guard.server";
import { issueTestnetDeveloperWalletChallenge } from "../../../src/lib/testnet-wallet-first-auth.server";

function publicCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/^[A-Z][A-Z0-9_]{2,119}$/.test(message)) return message;
  return "TESTNET_SIGNIN_CHALLENGE_FAILED";
}

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });

  try {
    assertTestnetAuthSameOrigin(event);
    const body = await readBody<Record<string, unknown>>(event);
    const data = await issueTestnetDeveloperWalletChallenge(
      String(body?.wallet_address ?? ""),
      body?.chain_id,
    );
    return { ok: true, data, execution_authorized: false };
  } catch (error) {
    const code = publicCode(error);
    const forbidden = code === "TESTNET_AUTH_ORIGIN_REQUIRED" || code === "TESTNET_AUTH_ORIGIN_FORBIDDEN";
    throw createError({ statusCode: forbidden ? 403 : 400, statusMessage: code });
  }
});
