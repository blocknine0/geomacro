import { createError, defineEventHandler, readBody, setResponseHeaders } from "h3";

import { requireTestnetTesterSession } from "../../../src/lib/testnet-tester-account.server";
import {
  clearTesterSessionCookie,
  setTesterSessionCookie,
  testerSessionTokenFromRequest,
} from "../../../src/lib/testnet-tester-cookie.server";
import {
  authenticateTestnetDeveloperWallet,
  retireSupersededTesterSession,
} from "../../../src/lib/testnet-wallet-first-auth.server";

function publicCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/^[A-Z][A-Z0-9_]{2,119}$/.test(message)) return message;
  return "TESTNET_WALLET_SIGNIN_FAILED";
}

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });

  const previousToken = testerSessionTokenFromRequest(event);
  let previousSession: { principalId: string; sessionId: string } | null = null;
  if (previousToken) {
    try {
      previousSession = await requireTestnetTesterSession(previousToken);
    } catch {
      clearTesterSessionCookie(event);
    }
  }

  const body = await readBody<Record<string, unknown>>(event);
  try {
    const result = await authenticateTestnetDeveloperWallet({
      walletAddress: String(body?.wallet_address ?? ""),
      chainId: body?.chain_id,
      nonce: String(body?.nonce ?? ""),
      issuedAt: Number(body?.issued_at ?? 0),
      message: String(body?.message ?? ""),
      signature: String(body?.signature ?? ""),
      profileName: String(body?.profile_name ?? "").trim() || undefined,
    });

    setTesterSessionCookie(event, result.session_token);

    if (previousSession) {
      try {
        await retireSupersededTesterSession({
          sessionId: previousSession.sessionId,
          principalId: previousSession.principalId,
          canonicalPrincipalId: result.principal_id,
        });
      } catch (cleanupError) {
        console.warn("[testnet-wallet-auth] previous session cleanup failed", cleanupError);
      }
    }

    const { session_token: _privateSessionToken, ...publicResult } = result;
    return { ok: true, data: publicResult, execution_authorized: false };
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: publicCode(error) });
  }
});
