import { createError, defineEventHandler, readBody, setResponseHeaders } from "h3";

import { recordTestnetSharePlatform } from "../../../src/lib/testnet-share.server";
import { requireTesterPrincipal } from "../../../src/lib/testnet-tester-http.server";

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  const session = await requireTesterPrincipal(event);
  const body = await readBody<Record<string, unknown>>(event);

  try {
    await recordTestnetSharePlatform({
      principalId: session.principalId,
      shareSlug: String(body?.share_slug ?? ""),
      platform: String(body?.platform ?? ""),
    });
    return { ok: true };
  } catch (error) {
    const code = error instanceof Error ? error.message : "TESTNET_SHARE_EVENT_FAILED";
    throw createError({ statusCode: 400, statusMessage: code.slice(0, 120) });
  }
});
