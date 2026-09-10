import { createError, defineEventHandler, getQuery, sendRedirect, setResponseHeaders } from "h3";

import { completeTesterOauthCallback } from "../../../../../src/lib/testnet-oauth.server";
import { requireTesterPrincipal } from "../../../../../src/lib/testnet-tester-http.server";

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });

  const query = getQuery(event);
  const code = String(query.code ?? "").trim();
  const state = String(query.state ?? "").trim();
  const oauthError = String(query.error ?? "").trim();
  if (oauthError) return sendRedirect(event, "/testnet-access?oauth=discord_declined", 302);
  if (!code || !state) {
    throw createError({ statusCode: 400, statusMessage: "DISCORD_OAUTH_CALLBACK_INVALID" });
  }

  const session = await requireTesterPrincipal(event);
  try {
    await completeTesterOauthCallback({
      event,
      principalId: session.principalId,
      provider: "discord",
      code,
      state,
    });
    return sendRedirect(event, "/testnet-access?oauth=discord_connected", 302);
  } catch (error) {
    const codeName = error instanceof Error ? error.message : "DISCORD_OAUTH_CALLBACK_FAILED";
    throw createError({ statusCode: 400, statusMessage: codeName.slice(0, 120) });
  }
});
