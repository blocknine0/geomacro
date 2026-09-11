import { createError, defineEventHandler, readBody, setResponseHeaders } from "h3";

import {
  createTestnetTesterAccount,
  requireTestnetTesterSession,
} from "../../../src/lib/testnet-tester-account.server";
import {
  setTesterSessionCookie,
  testerSessionTokenFromRequest,
} from "../../../src/lib/testnet-tester-cookie.server";

type RegistrationFailureLike = {
  code?: unknown;
  message?: unknown;
};

function registrationFailureCode(error: unknown) {
  const candidate = (error ?? {}) as RegistrationFailureLike;
  const rawCode = String(candidate.code ?? "").trim();
  const rawMessage = String(candidate.message ?? error ?? "").trim();

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
  if (rawCode === "23505") return "TESTNET_ACCOUNT_CONFLICT";

  const safeMessageCodes = new Set([
    "INVALID_PROFILE_NAME",
    "INVALID_TERMS_VERSION",
  ]);
  if (safeMessageCodes.has(rawMessage)) return rawMessage;

  return "TESTER_REGISTRATION_FAILED";
}

function registrationFailureStatus(code: string) {
  const configurationFailure = [
    "TESTNET_DATABASE_NOT_CONFIGURED",
    "TESTNET_DATABASE_SCHEMA_MISSING",
    "TESTNET_DATABASE_PERMISSION_DENIED",
  ].includes(code);
  return configurationFailure ? 503 : 400;
}

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });

  const existingToken = testerSessionTokenFromRequest(event);
  if (existingToken) {
    try {
      const existing = await requireTestnetTesterSession(existingToken);
      return {
        ok: true,
        data: {
          principal_id: existing.principalId,
          registration_created: false,
          next_step: "verify_wallet",
        },
        execution_authorized: false,
      };
    } catch {
      // Invalid or expired sessions fall through to a fresh tester profile.
    }
  }

  const body = await readBody<Record<string, unknown>>(event);

  try {
    const result = await createTestnetTesterAccount({
      profileName: String(body?.profile_name ?? ""),
      termsVersion: String(body?.terms_version ?? "testnet-terms-v2-wallet-only"),
    });

    setTesterSessionCookie(event, result.session_token);

    return {
      ok: true,
      data: {
        principal_id: result.principal_id,
        session_expires_at: result.session_expires_at,
        registration_created: true,
        next_step: "verify_wallet",
      },
      execution_authorized: false,
    };
  } catch (error) {
    const code = registrationFailureCode(error);
    throw createError({
      statusCode: registrationFailureStatus(code),
      statusMessage: code,
    });
  }
});
