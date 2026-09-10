import { createError, defineEventHandler, readBody, setResponseHeaders } from "h3";

import { createTestnetTesterAccount } from "../../../src/lib/testnet-tester-account.server";

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });

  const body = await readBody<Record<string, unknown>>(event);
  try {
    const result = await createTestnetTesterAccount({
      email: String(body?.email ?? ""),
      profileName: String(body?.profile_name ?? ""),
      termsVersion: String(body?.terms_version ?? "testnet-terms-v1"),
    });

    // email_verification_token is returned only until an outbound email provider
    // is configured. The public UI must not display it in production.
    return { ok: true, data: result, execution_authorized: false };
  } catch (error) {
    const code = error instanceof Error ? error.message : "TESTER_REGISTRATION_FAILED";
    throw createError({ statusCode: 400, statusMessage: code.slice(0, 120) });
  }
});
