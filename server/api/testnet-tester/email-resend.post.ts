import { createError, defineEventHandler, readBody, setResponseHeaders } from "h3";

import { issueTestnetEmailRecoveryChallenge } from "../../../src/lib/testnet-email-recovery.server";
import { sendTestnetVerificationEmail } from "../../../src/lib/testnet-email-delivery.server";
import { requireTesterPrincipal } from "../../../src/lib/testnet-tester-http.server";

type FailureLike = {
  code?: unknown;
  message?: unknown;
};

function safeFailureCode(error: unknown) {
  const candidate = (error ?? {}) as FailureLike;
  const rawCode = String(candidate.code ?? "").trim();
  const rawMessage = String(candidate.message ?? error ?? "").trim();

  if (rawMessage === "INVALID_EMAIL") return rawMessage;
  if (rawMessage === "TESTNET_EMAIL_MISMATCH") return rawMessage;
  if (rawMessage === "TESTNET_PROFILE_NOT_FOUND") return rawMessage;
  if (rawMessage === "TESTNET_EMAIL_DELIVERY_NOT_CONFIGURED") return rawMessage;
  if (/^TESTNET_EMAIL_DELIVERY_FAILED_\d{3}$/.test(rawMessage)) return rawMessage;
  if (rawMessage === "Risk Supabase service-role client is not configured for the authoritative project") {
    return "TESTNET_DATABASE_NOT_CONFIGURED";
  }
  if (
    rawCode === "42P01" ||
    rawCode === "PGRST204" ||
    rawCode === "PGRST205" ||
    /relation .* does not exist/i.test(rawMessage) ||
    /schema cache/i.test(rawMessage)
  ) {
    return "TESTNET_DATABASE_SCHEMA_MISSING";
  }
  if (rawCode === "42501") return "TESTNET_DATABASE_PERMISSION_DENIED";
  if (rawCode === "23503" || rawCode === "23514") return "TESTNET_DATABASE_CONSTRAINT_FAILED";
  return "TESTNET_EMAIL_RESEND_FAILED";
}

function failureStatus(code: string) {
  if (
    [
      "TESTNET_EMAIL_DELIVERY_NOT_CONFIGURED",
      "TESTNET_DATABASE_NOT_CONFIGURED",
      "TESTNET_DATABASE_SCHEMA_MISSING",
      "TESTNET_DATABASE_PERMISSION_DENIED",
    ].includes(code) ||
    /^TESTNET_EMAIL_DELIVERY_FAILED_5\d{2}$/.test(code)
  ) {
    return 503;
  }
  return 400;
}

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });

  const { principalId } = await requireTesterPrincipal(event);
  const body = await readBody<Record<string, unknown>>(event);
  const email = String(body?.email ?? "");

  try {
    const challenge = await issueTestnetEmailRecoveryChallenge({
      principalId,
      email,
    });

    if (challenge.already_verified) {
      return {
        ok: true,
        data: {
          email_verification_sent: false,
          already_verified: true,
        },
        execution_authorized: false,
      };
    }

    await sendTestnetVerificationEmail({
      to: email,
      verificationToken: challenge.verification_token,
    });

    return {
      ok: true,
      data: {
        email_verification_sent: true,
        already_verified: false,
        email_verification_expires_at: challenge.expires_at,
      },
      execution_authorized: false,
    };
  } catch (error) {
    const code = safeFailureCode(error);
    throw createError({
      statusCode: failureStatus(code),
      statusMessage: code,
    });
  }
});
