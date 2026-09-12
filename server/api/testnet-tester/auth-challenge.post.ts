import { createError, defineEventHandler, readBody, setResponseHeaders } from "h3";

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

  const body = await readBody<Record<string, unknown>>(event);
  try {
    const data = await issueTestnetDeveloperWalletChallenge(
      String(body?.wallet_address ?? ""),
      body?.chain_id,
    );
    return { ok: true, data, execution_authorized: false };
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: publicCode(error) });
  }
});
