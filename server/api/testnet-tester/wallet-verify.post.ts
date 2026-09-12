import { createError, defineEventHandler, readBody, setResponseHeaders } from "h3";

import { verifyTestnetWalletSignature } from "../../../src/lib/testnet-tester-account.server";
import { setTesterSessionCookie } from "../../../src/lib/testnet-tester-cookie.server";
import { requireTesterPrincipal } from "../../../src/lib/testnet-tester-http.server";

function publicWalletVerificationCode(error: unknown) {
  const raw = error instanceof Error ? error.message : "";
  if (/^[A-Z][A-Z0-9_]{2,119}$/.test(raw)) return raw;
  return "WALLET_VERIFICATION_FAILED";
}

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  const session = await requireTesterPrincipal(event);
  const body = await readBody<Record<string, unknown>>(event);
  try {
    const result = await verifyTestnetWalletSignature({
      principalId: session.principalId,
      sessionId: session.sessionId,
      walletAddress: String(body?.wallet_address ?? ""),
      nonce: String(body?.nonce ?? ""),
      message: String(body?.message ?? ""),
      signature: String(body?.signature ?? ""),
    });

    const rotated = result as typeof result & { replacement_session_token?: string };
    if (rotated.replacement_session_token) {
      setTesterSessionCookie(event, rotated.replacement_session_token);
    }
    const { replacement_session_token: _privateSessionToken, ...publicResult } = rotated;

    return { ok: true, data: publicResult };
  } catch (error) {
    const code = publicWalletVerificationCode(error);
    throw createError({ statusCode: 400, statusMessage: code });
  }
});
