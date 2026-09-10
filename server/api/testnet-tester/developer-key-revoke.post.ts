import { createError, defineEventHandler, readBody, setResponseHeaders } from "h3";

import { revokeOwnedTestnetDeveloperApiKey } from "../../../src/lib/testnet-developer-management.server";
import { requireTesterPrincipal } from "../../../src/lib/testnet-tester-http.server";

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  const session = await requireTesterPrincipal(event);
  const body = await readBody<Record<string, unknown>>(event);
  try {
    const result = await revokeOwnedTestnetDeveloperApiKey({
      principalId: session.principalId,
      credentialId: String(body?.credential_id ?? ""),
    });
    return { ok: true, data: result, execution_authorized: false };
  } catch (error) {
    const code = error instanceof Error ? error.message : "TESTNET_DEVELOPER_KEY_REVOKE_FAILED";
    throw createError({ statusCode: 400, statusMessage: code.slice(0, 120) });
  }
});
