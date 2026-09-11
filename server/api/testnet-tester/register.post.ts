import { createError, defineEventHandler, readBody, setResponseHeaders } from "h3";

import { createTestnetTesterAccount } from "../../../src/lib/testnet-tester-account.server";
import { setTesterSessionCookie } from "../../../src/lib/testnet-tester-cookie.server";
import { sendTestnetVerificationEmail } from "../../../src/lib/testnet-email-delivery.server";

type RegistrationFailureLike = {
  code?: unknown;
  message?: unknown;
};

function registrationFailureCode(error: unknown) {
  const candidate = (error ?? {}) as RegistrationFailureLike;
  const rawCode = String(candidate.code ?? "").trim();
  const rawMessage = String(candidate.message ?? "").trim();

  if (rawMessage === "TESTNET_EMAIL_DELIVERY_NOT_CONFIGURED") {
    return "TESTNET_EMAIL_DELIVERY_NOT_CONFIGURED";
  }
  if (rawMessage === "Risk Supabase service-role client is not configured for the authoritative project") {
    return "TESTNET_DATABASE_NOT_CONFIGURED";
  }
  if (rawCode === "42P01" || /relation .* does not exist/i.test(rawMessage)) {
    return "TESTNET_DATABASE_SCHEMA_MISSING";
  }
  if (rawCode === "42501") {
    return "TESTNET_DATABASE_PERMISSION_DENIED";
  }
  if (rawCode === "23503" || rawCode === "23514") {
    return "TESTNET_DATABASE_CONSTRAINT_FAILED";
  }
  if (rawCode === "23505") {
    return "TESTNET_ACCOUNT_CONFLICT";
  }

  const safeMessageCodes = new Set([
    "INVALID_EMAIL",
    "INVALID_PROFILE_NAME",
    "INVALID_TERMS_VERSION",
  ]);
  if (safeMessageCodes.has(rawMessage)) return rawMessage;

  return "TESTER_REGISTRATION_FAILED";
}

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

    setTesterSessionCookie(event, result.session_token);

    return {
      ok: true,
      data: {
        principal_id: result.principal_id,
        session_expires_at: result.session_expires_at,
        email_verification_expires_at: result.email_verification_expires_at,
        email_verification_sent: true,
      },
      execution_authorized: false,
    };
  } catch (error) {
    const code = registrationFailureCode(error);
    const configurationFailure = [
      "TESTNET_EMAIL_DELIVERY_NOT_CONFIGURED",
      "TESTNET_DATABASE_NOT_CONFIGURED",
      "TESTNET_DATABASE_SCHEMA_MISSING",
      "TESTNET_DATABASE_PERMISSION_DENIED",
    ].includes(code);
    throw createError({
      statusCode: configurationFailure ? 503 : 400,
      statusMessage: code,
    });
  }
});
