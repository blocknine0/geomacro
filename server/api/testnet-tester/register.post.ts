import { createError, defineEventHandler, readBody, setResponseHeaders } from "h3";

import { createTestnetTesterAccount } from "../../../src/lib/testnet-tester-account.server";
import { sendTestnetVerificationEmail } from "../../../src/lib/testnet-email-delivery.server";

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });

  const body = await readBody<Record<string, unknown>>(event);
  const email = String(body?.email ?? "");

  try {
    const result = await createTestnetTesterAccount({
      email,
      profileName: String(body?.profile_name ?? ""),
      termsVersion: String(body?.terms_version ?? "testnet-terms-v1"),
    });

    await sendTestnetVerificationEmail({
      to: email,
      verificationToken: result.email_verification_token,
    });

    return {
      ok: true,
      data: {
        principal_id: result.principal_id,
        session_token: result.session_token,
        session_expires_at: result.session_expires_at,
        email_verification_expires_at: result.email_verification_expires_at,
        email_verification_sent: true,
      },
      execution_authorized: false,
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : "TESTER_REGISTRATION_FAILED";
    const configurationFailure = code === "TESTNET_EMAIL_DELIVERY_NOT_CONFIGURED";
    throw createError({
      statusCode: configurationFailure ? 503 : 400,
      statusMessage: code.slice(0, 120),
    });
  }
});
