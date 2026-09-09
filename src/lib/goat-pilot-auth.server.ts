import {
  timingSafeEqual,
} from "node:crypto";

function configuredPilotToken(): string | null {
  const token =
    process.env
      .GOATX402_PILOT_ACCESS_TOKEN
      ?.trim() ?? "";

  if (
    token.length < 32 ||
    token.length > 512 ||
    /[\u0000-\u001F\u007F]/.test(token)
  ) {
    return null;
  }

  return token;
}

function bearerToken(request: Request): string | null {
  const header =
    request.headers.get("authorization") ?? "";
  const match =
    header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim() ?? "";

  if (
    token.length < 32 ||
    token.length > 512
  ) {
    return null;
  }

  return token;
}

function equalSecret(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isGoatPilotAccessConfigured(): boolean {
  return configuredPilotToken() !== null;
}

/**
 * Partner-pilot access credential only.
 *
 * This token is intentionally separate from GOAT merchant API credentials and
 * from Geomacro production billing/auth. It can be rotated independently and
 * never grants wallet, transaction or execution authority.
 */
export function requireGoatPilotAccess(request: Request): void {
  const expected = configuredPilotToken();
  if (!expected) {
    throw new Error("GOAT_PILOT_ACCESS_NOT_CONFIGURED");
  }

  const provided = bearerToken(request);
  if (!provided || !equalSecret(provided, expected)) {
    throw new Error("GOAT_PILOT_ACCESS_DENIED");
  }
}
