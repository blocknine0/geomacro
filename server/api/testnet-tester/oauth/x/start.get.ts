import { createError, defineEventHandler, sendRedirect, setResponseHeaders } from "h3";

import { buildTesterOauthAuthorizeUrl } from "../../../../../src/lib/testnet-oauth.server";
import { requireTesterPrincipal } from "../../../../../src/lib/testnet-tester-http.server";

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });

  const session = await requireTesterPrincipal(event);
  try {
    const url = await buildTesterOauthAuthorizeUrl({
      event,
      principalId: session.principalId,
      provider: "x",
    });
    return sendRedirect(event, url, 302);
  } catch (error) {
    const code = error instanceof Error ? error.message : "X_OAUTH_START_FAILED";
    throw createError({ statusCode: code.endsWith("_NOT_CONFIGURED") ? 503 : 400, statusMessage: code.slice(0, 120) });
  }
});
